import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { ChevronLeft } from "lucide-react-native";
import FeedReelItem from "./FeedReelItem";
import type { MediaRect } from "./FeedInstaCard";
import type { FeedPost } from "../utils/feedApi";
import { useFullScreenOverlay } from "../context/FullScreenOverlayContext";

type Props = {
  visible: boolean;
  post: FeedPost | null;
  /**
   * Source rect of the media tile at open time. Kept in the API for callers
   * but the open animation no longer morphs from this rect — it's a subtle
   * fade + scale instead. Safe to pass `null`.
   */
  fromRect?: MediaRect | null;
  token: string | null;
  currentUserId?: string | null;
  onClose: () => void;
  onMergePost: (postId: string, merge: Partial<FeedPost>) => void;
  onReplacePost: (post: FeedPost) => void;
  onDeleted: (postId: string) => void;
  onOpenComments: (postId: string) => void;
  onShareWithFriends: (post: FeedPost) => void;
};

const SCREEN = Dimensions.get("window");
const OPEN_DURATION = 180;
const CLOSE_DURATION = 160;
/** Drag distance past which release dismisses the viewer. */
const DISMISS_DISTANCE = 80;
/** Drag velocity past which release dismisses the viewer. */
const DISMISS_VELOCITY = 0.6;
/** Minimum distance before we'll claim a swipe-to-dismiss gesture. */
const GESTURE_CLAIM_DISTANCE = 6;
/**
 * How dominant one axis needs to be over the other before we treat a swipe
 * as "horizontal" or "vertical". A natural left swipe on a phone has plenty
 * of vertical drift, so we accept that horizontal only needs to be ~50% of
 * vertical to count as a left swipe.
 */
const AXIS_DOMINANCE_RATIO = 0.5;

type DismissAxis = "down" | "left" | null;

/**
 * Full-screen reel viewer rendered as an in-tree overlay (not a `Modal`).
 *
 * Using an absolutely-positioned `View` instead of a native `Modal` is
 * deliberate: iOS only presents one modal at a time, so when this lived inside
 * a `<Modal>` the comment sheet, post-options sheet, share sheet, and
 * navigation to other screens (e.g. the public profile) would either be
 * blocked or render *behind* the viewer. As an in-tree overlay, the system
 * `Modal`s and the navigation stack render naturally on top of it, so every
 * action button (like / comment / report / profile tap) behaves the same as
 * it does from the main feed.
 *
 * To make the overlay still cover the bottom tab bar we push a flag onto the
 * shared `FullScreenOverlayContext`; the tab navigator collapses its tab bar
 * while any overlay is open, restoring it the instant we close.
 */
export default function FullScreenReelViewer({
  visible,
  post,
  token,
  currentUserId,
  onClose,
  onMergePost,
  onReplacePost,
  onDeleted,
  onOpenComments,
  onShareWithFriends,
}: Props) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { pushOverlay, popOverlay } = useFullScreenOverlay();
  const [mounted, setMounted] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.97)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  /**
   * The drag direction the user committed to on this gesture. Locked the
   * moment the PanResponder claims the responder so a wobbly diagonal drag
   * doesn't flip-flop between axes. Cleared on release.
   */
  const dismissAxisRef = useRef<DismissAxis>(null);

  const animateOpen = useCallback(() => {
    isClosingRef.current = false;
    opacity.setValue(0);
    scale.setValue(0.97);
    dragX.setValue(0);
    dragY.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: OPEN_DURATION,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 9,
        tension: 110,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale, dragX, dragY]);

  const finishClose = useCallback(() => {
    setMounted(false);
    isClosingRef.current = false;
    dismissAxisRef.current = null;
    opacity.setValue(0);
    scale.setValue(0.97);
    dragX.setValue(0);
    dragY.setValue(0);
    onClose();
  }, [opacity, scale, dragX, dragY, onClose]);

  const animateClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: CLOSE_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.97,
        duration: CLOSE_DURATION,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) finishClose();
    });
  }, [opacity, scale, finishClose]);

  useEffect(() => {
    if (visible && post) {
      isClosingRef.current = false;
      setMounted(true);
    } else if (!visible && mounted) {
      animateClose();
    }
  }, [visible, post, mounted, animateClose]);

  useEffect(() => {
    if (!mounted) return;
    const id = requestAnimationFrame(animateOpen);
    return () => cancelAnimationFrame(id);
  }, [mounted, animateOpen]);

  // Mark the overlay as open while we're mounted so the bottom tab bar hides.
  useEffect(() => {
    if (!mounted) return;
    pushOverlay();
    return () => popOverlay();
  }, [mounted, pushOverlay, popOverlay]);

  // Hardware back closes the viewer (Android).
  useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      animateClose();
      return true;
    });
    return () => sub.remove();
  }, [mounted, animateClose]);

  const pickDismissAxis = useCallback(
    (dx: number, dy: number): DismissAxis => {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      // Prefer a left-swipe interpretation when the horizontal component is
      // at least `AXIS_DOMINANCE_RATIO` of the vertical component AND the
      // user is moving left. Otherwise fall back to a downward dismiss.
      const isLeftish = dx < 0 && absX >= absY * AXIS_DOMINANCE_RATIO;
      const isDownish = dy > 0 && absY >= absX * AXIS_DOMINANCE_RATIO;
      if (isLeftish && (!isDownish || absX > absY)) return "left";
      if (isDownish) return "down";
      return null;
    },
    [],
  );

  const shouldClaimGesture = useCallback(
    (dx: number, dy: number) => {
      // Don't even consider claiming until the user has moved past the
      // deadzone in one of our dismiss directions.
      if (dx > -GESTURE_CLAIM_DISTANCE && dy < GESTURE_CLAIM_DISTANCE) {
        return false;
      }
      return pickDismissAxis(dx, dy) !== null;
    },
    [pickDismissAxis],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_evt, g) =>
          shouldClaimGesture(g.dx, g.dy),
        // Capture variant fires *before* any child responder (e.g. a Pressable
        // the user is touching) gets to keep the move. Without this, dragging
        // across one of the rail action buttons would never reach us because
        // the Pressable would hold the gesture and silently swallow the move.
        onMoveShouldSetPanResponderCapture: (_evt, g) =>
          shouldClaimGesture(g.dx, g.dy),
        onPanResponderGrant: (_evt, g) => {
          // Lock the dismiss axis as soon as we claim the gesture so the
          // viewer doesn't jitter if the user's drag wanders slightly. Falls
          // back to "down" if the axis classifier is ambiguous, which keeps
          // the viewer responsive even on borderline gestures.
          dismissAxisRef.current = pickDismissAxis(g.dx, g.dy) ?? "down";
          dragX.setValue(0);
          dragY.setValue(0);
        },
        onPanResponderMove: (_evt, g) => {
          const axis = dismissAxisRef.current;
          if (axis === "left") {
            // Track leftward freely; right-ward drags hit resistance so the
            // viewer always feels anchored to the gesture.
            dragX.setValue(g.dx < 0 ? g.dx : g.dx * 0.25);
          } else if (axis === "down") {
            dragY.setValue(g.dy < 0 ? g.dy * 0.25 : g.dy);
          }
        },
        onPanResponderRelease: (_evt, g) => {
          const axis = dismissAxisRef.current;
          dismissAxisRef.current = null;
          const dismissDown =
            axis === "down" &&
            (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY);
          const dismissLeft =
            axis === "left" &&
            (g.dx < -DISMISS_DISTANCE || g.vx < -DISMISS_VELOCITY);

          if (dismissDown || dismissLeft) {
            isClosingRef.current = true;
            Animated.parallel([
              Animated.timing(opacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(dragX, {
                toValue: dismissLeft ? -SCREEN.width : 0,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(dragY, {
                toValue: dismissDown ? SCREEN.height : 0,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start(({ finished }) => {
              if (finished) finishClose();
            });
          } else {
            // Spring both back regardless of which axis was driven so we
            // always end up at rest.
            Animated.spring(dragX, {
              toValue: 0,
              friction: 7,
              tension: 90,
              useNativeDriver: true,
            }).start();
            Animated.spring(dragY, {
              toValue: 0,
              friction: 7,
              tension: 90,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          dismissAxisRef.current = null;
          Animated.spring(dragX, {
            toValue: 0,
            friction: 7,
            tension: 90,
            useNativeDriver: true,
          }).start();
          Animated.spring(dragY, {
            toValue: 0,
            friction: 7,
            tension: 90,
            useNativeDriver: true,
          }).start();
        },
      }),
    [dragX, dragY, opacity, finishClose, shouldClaimGesture, pickDismissAxis],
  );

  if (!mounted || !post) return null;

  // Backdrop fades alongside the viewer's main opacity AND as the user drags
  // toward dismissal, so the gesture feels physical.
  const downwardFade = dragY.interpolate({
    inputRange: [0, SCREEN.height * 0.9],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const leftwardFade = dragX.interpolate({
    inputRange: [-SCREEN.width * 0.9, 0],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const dragFade = Animated.multiply(downwardFade, leftwardFade);
  const backdropOpacity = Animated.multiply(opacity, dragFade);

  return (
    <View
      style={styles.host}
      pointerEvents="auto"
      // Mount the pan responder on the OUTERMOST overlay View so it sits at
      // the very top of the responder chain — any move event has to walk
      // through it before it can be claimed by an inner Pressable. This is
      // what makes the leftward swipe-to-dismiss reliable even when the
      // user's finger starts on top of an action button.
      {...panResponder.panHandlers}
    >
      {Platform.OS === "ios" ? (
        <StatusBar barStyle="light-content" animated />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[styles.backdrop, { opacity: backdropOpacity }]}
      />

      <Animated.View
        style={[
          styles.container,
          {
            opacity,
            transform: [
              { translateX: dragX },
              { translateY: dragY },
              { scale },
            ],
          },
        ]}
      >
        <FeedReelItem
          post={post}
          screenFocused={isFocused}
          isActive
          overlaysSubdued={false}
          viewportHeight={SCREEN.height}
          viewportWidth={SCREEN.width}
          token={token}
          currentUserId={currentUserId}
          onDeleted={(id) => {
            onDeleted(id);
            animateClose();
          }}
          onMergePost={onMergePost}
          onReplacePost={onReplacePost}
          onOpenComments={() => onOpenComments(post.id)}
          onShareWithFriends={() => onShareWithFriends(post)}
        />

        <View
          pointerEvents="box-none"
          style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        >
          <Pressable
            onPress={animateClose}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <ChevronLeft size={28} color="#fff" strokeWidth={2.4} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 1000,
    elevation: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 8,
    zIndex: 30,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});
