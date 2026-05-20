import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import FeedReelItem from "./FeedReelItem";
import type { MediaRect } from "./FeedInstaCard";
import type { FeedPost } from "../utils/feedApi";

type Props = {
  visible: boolean;
  post: FeedPost | null;
  /** The media tile's screen rect at open time. Used for the morph animation. */
  fromRect: MediaRect | null;
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
const OPEN_DURATION = 280;
const CLOSE_DURATION = 240;
/** Drag distance past which release dismisses. */
const DISMISS_DISTANCE = 110;
/** Drag velocity past which release dismisses. */
const DISMISS_VELOCITY = 0.85;

export default function FullScreenReelViewer({
  visible,
  post,
  fromRect,
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
  const [mounted, setMounted] = useState(false);
  // 1 = fully open (fullscreen), 0 = collapsed to source rect
  const progress = useRef(new Animated.Value(0)).current;
  // Extra translateY while user is actively dragging downward.
  const dragY = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  const sourceRect = useRef<MediaRect | null>(null);

  // Cache source rect for the close animation in case the parent re-mounts.
  if (visible && fromRect && !sourceRect.current) {
    sourceRect.current = fromRect;
  }

  const animateOpen = useCallback(() => {
    progress.setValue(0);
    dragY.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_DURATION,
      useNativeDriver: true,
    }).start();
  }, [progress, dragY]);

  const finishClose = useCallback(() => {
    setMounted(false);
    isClosingRef.current = false;
    sourceRect.current = null;
    progress.setValue(0);
    dragY.setValue(0);
    onClose();
  }, [progress, dragY, onClose]);

  const animateClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    // Slide the reel down off-screen while keeping its full-open scale; this
    // mirrors Instagram's reel dismiss (continues the drag instead of
    // morphing back to the card rect).
    Animated.timing(dragY, {
      toValue: SCREEN.height,
      duration: CLOSE_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) finishClose();
    });
  }, [dragY, finishClose]);

  useEffect(() => {
    if (visible && post) {
      sourceRect.current = fromRect;
      isClosingRef.current = false;
      setMounted(true);
    } else if (!visible && mounted) {
      animateClose();
    }
  }, [visible, post, fromRect, mounted, animateClose]);

  useEffect(() => {
    if (mounted) {
      // Defer to next frame so the modal can lay out before we animate.
      const id = requestAnimationFrame(animateOpen);
      return () => cancelAnimationFrame(id);
    }
  }, [mounted, animateOpen]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, g) => {
          // Only claim downward vertical drags so child UI can still scroll/swipe.
          return g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4;
        },
        onPanResponderGrant: () => {
          dragY.setValue(0);
        },
        onPanResponderMove: (_evt, g) => {
          if (g.dy < 0) {
            dragY.setValue(g.dy * 0.25);
          } else {
            dragY.setValue(g.dy);
          }
        },
        onPanResponderRelease: (_evt, g) => {
          const shouldDismiss =
            g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY;
          if (shouldDismiss) {
            animateClose();
          } else {
            Animated.spring(dragY, {
              toValue: 0,
              friction: 7,
              tension: 90,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            friction: 7,
            tension: 90,
            useNativeDriver: true,
          }).start();
        },
      }),
    [dragY, animateClose],
  );

  if (!mounted || !post) return null;

  const rect = sourceRect.current ?? {
    x: 0,
    y: SCREEN.height / 2 - SCREEN.width / 2,
    width: SCREEN.width,
    height: SCREEN.width,
  };

  // From the source rect to centred fullscreen.
  const startScaleX = rect.width / SCREEN.width;
  const startScaleY = rect.height / SCREEN.height;
  // We need a single scale so the rect maps proportionally; use X-axis scale
  // because both the source card and target fill the full width.
  const morphScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [startScaleX, 1],
  });

  // Translate so the centre of the rect maps to the centre of the screen at progress 0.
  const startCenterX = rect.x + rect.width / 2;
  const startCenterY = rect.y + rect.height / 2;
  const targetCenterX = SCREEN.width / 2;
  const targetCenterY = SCREEN.height / 2;
  const morphTx = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [startCenterX - targetCenterX, 0],
  });
  const morphTy = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [startCenterY - targetCenterY, 0],
  });

  // Slight vertical drift during drag (also drives backdrop fade).
  const dragScale = dragY.interpolate({
    inputRange: [0, 200, 400],
    outputRange: [1, 0.92, 0.82],
    extrapolate: "clamp",
  });

  const containerTransform: Animated.WithAnimatedArray<
    | { translateX: Animated.AnimatedInterpolation<number> }
    | { translateY: Animated.AnimatedInterpolation<number> | Animated.Value }
    | { scale: Animated.AnimatedInterpolation<number> }
  > = [
    { translateX: morphTx },
    { translateY: morphTy },
    { translateY: dragY },
    { scale: morphScale },
    { scale: dragScale },
  ];

  // Backdrop ramps in with progress, fades out as the reel is dragged or
  // slid off-screen on dismiss.
  const backdropOpacity = Animated.multiply(
    progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
    dragY.interpolate({
      inputRange: [0, SCREEN.height * 0.9],
      outputRange: [1, 0],
      extrapolate: "clamp",
    }),
  );

  // Y-axis scale needs to also account for the rectangle's aspect ratio so the
  // content fits inside the source rect at progress 0. We layer a second
  // transform on the inner view to compensate for the X/Y aspect difference.
  const innerScaleY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [startScaleY / startScaleX, 1],
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={animateClose}
    >
      <StatusBar barStyle="light-content" />
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="none"
      />

      <Animated.View
        style={[
          styles.container,
          {
            width: SCREEN.width,
            height: SCREEN.height,
            transform: containerTransform,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.inner,
            {
              transform: [{ scaleY: innerScaleY }],
            },
          ]}
        >
          <FeedReelItem
            post={post}
            screenFocused
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
        </Animated.View>

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
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  container: {
    position: "absolute",
    left: 0,
    top: 0,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
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
