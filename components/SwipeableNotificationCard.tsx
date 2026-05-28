import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Trash2 } from "lucide-react-native";
import Button from "./Button";

type Props = {
  /** The notification row content. Receives taps normally while the row is
   * at rest; while open, taps on the content close the swipe instead of
   * being forwarded down. */
  children: ReactNode;
  /** Called once the row should be removed. Triggered by tapping the
   * revealed delete button or completing a full-width swipe. */
  onDelete: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Horizontal padding kept on both sides of the delete button (left = gap to
 * card, right = gap to screen edge) so the action never feels glued. */
const SIDE_PADDING = 10;
/** "Natural" width the button settles at when the row is held open. */
const NATURAL_WIDTH = 80;
/** Resting offset for the card when the row is held open. The card slides
 * far enough left to reveal the natural-sized button plus its gap on both
 * sides. */
const REVEAL_OFFSET = -(NATURAL_WIDTH + SIDE_PADDING * 2);
/** Min horizontal drag (px) before we steal the gesture from the FlatList. */
const HORIZONTAL_ACTIVATE = 8;
/** Fraction of row width past which a release triggers an immediate delete. */
const FULL_SWIPE_FRACTION = 0.6;

export default function SwipeableNotificationCard({
  children,
  onDelete,
  style,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  /** Where the row sits when no finger is on it. */
  const restPositionRef = useRef(0);
  /** Live width of the row container, mirrored into state so interpolations
   * can use it when the layout is known. */
  const widthRef = useRef(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  /** Latch so the full-swipe haptic only fires once per gesture. */
  const fullSwipeHapticFiredRef = useRef(false);

  const animateTo = useCallback(
    (to: number) => {
      restPositionRef.current = to;
      setIsOpen(to !== 0);
      // JS-driven so width/opacity/scale interpolations stay in sync. A
      // slight bounciness lets the delete button "pop" into place when the
      // row settles to its open position.
      Animated.spring(translateX, {
        toValue: to,
        useNativeDriver: false,
        bounciness: 6,
        speed: 16,
      }).start();
    },
    [translateX],
  );

  const close = useCallback(() => animateTo(0), [animateTo]);

  const performDelete = useCallback(() => {
    // Slide off-screen so the deletion reads as a continuation of the swipe.
    const offscreen = -(widthRef.current || 320) - 24;
    restPositionRef.current = offscreen;
    Animated.timing(translateX, {
      toValue: offscreen,
      duration: 200,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) onDelete();
    });
  }, [onDelete, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) =>
        Math.abs(g.dx) > HORIZONTAL_ACTIVATE &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderGrant: () => {
        translateX.stopAnimation((v) => {
          restPositionRef.current = v;
        });
        fullSwipeHapticFiredRef.current = false;
      },
      onPanResponderMove: (_evt, g) => {
        const next = Math.min(0, restPositionRef.current + g.dx);
        translateX.setValue(next);

        const fullThreshold = -(widthRef.current * FULL_SWIPE_FRACTION);
        if (next < fullThreshold && !fullSwipeHapticFiredRef.current) {
          fullSwipeHapticFiredRef.current = true;
          try {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch {
            // Haptics unavailable on this platform — silent.
          }
        }
      },
      onPanResponderRelease: (_evt, g) => {
        const projected = Math.min(0, restPositionRef.current + g.dx);
        const fullThreshold = -(widthRef.current * FULL_SWIPE_FRACTION);

        if (projected < fullThreshold) {
          performDelete();
          return;
        }
        if (projected < REVEAL_OFFSET / 2) {
          animateTo(REVEAL_OFFSET);
        } else {
          animateTo(0);
        }
      },
      onPanResponderTerminate: () => {
        const projected = restPositionRef.current;
        animateTo(projected < REVEAL_OFFSET / 2 ? REVEAL_OFFSET : 0);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setContainerWidth(w);
  }, []);

  /**
   * Derive the delete button's box style from the live swipe distance.
   * - `width` grows linearly with the swipe past a small dead zone, so the
   *   button visually expands to fill the empty space the card leaves
   *   behind. Once the user swipes past the "natural" reveal, the button
   *   keeps stretching toward the full row width — that's the visual cue
   *   for "release here to delete".
   * - `opacity` ramps in over the first few pixels so the button isn't
   *   visible until the user clearly committed to a swipe.
   * - `scale` overshoots slightly between the dead zone and natural width
   *   to give the button a satisfying pop-in instead of a flat slide.
   */
  const deleteAreaStyle = useMemo(() => {
    if (containerWidth <= 0) return { width: 0, opacity: 0 };

    const maxWidth = containerWidth - SIDE_PADDING * 2;
    return {
      width: translateX.interpolate({
        inputRange: [-containerWidth, REVEAL_OFFSET, -SIDE_PADDING, 0],
        outputRange: [maxWidth, NATURAL_WIDTH, 0, 0],
        extrapolate: "clamp" as const,
      }),
      opacity: translateX.interpolate({
        inputRange: [-30, -8, 0],
        outputRange: [1, 0.3, 0],
        extrapolate: "clamp" as const,
      }),
      transform: [
        {
          scale: translateX.interpolate({
            inputRange: [-NATURAL_WIDTH, -30, -8, 0],
            outputRange: [1, 1.05, 0.7, 0.5],
            extrapolate: "clamp" as const,
          }),
        },
      ],
    };
  }, [containerWidth, translateX]);

  return (
    <View style={[styles.container, style]} onLayout={handleLayout}>
      <Animated.View
        style={[styles.deleteArea, deleteAreaStyle]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <Button
          icon={<Trash2 size={18} color="#fff" strokeWidth={2.2} />}
          variant="destructive"
          size="sm"
          fullWidth
          onPress={performDelete}
          haptic="medium"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.cardWrap,
          {
            transform: [{ translateX }],
            // Round the card's corners as it slides away from the edge so it
            // visually detaches into a "chip" instead of staying flush.
            borderRadius: translateX.interpolate({
              inputRange: [-SIDE_PADDING * 2, 0],
              outputRange: [12, 0],
              extrapolate: "clamp",
            }),
          },
        ]}
        {...panResponder.panHandlers}
      >
        {children}
        {/* When the row is open, intercept taps on the card so a tap closes
         * the swipe rather than opening the underlying notification. */}
        {isOpen ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityLabel="Close swipe actions"
          />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
  },
  cardWrap: {
    backgroundColor: "transparent",
    // Clip children to the animated border-radius so the rounded corners
    // actually mask the underlying notification card.
    overflow: "hidden",
  },
  deleteArea: {
    position: "absolute",
    right: SIDE_PADDING,
    top: 6,
    bottom: 6,
    justifyContent: "center",
    alignItems: "stretch",
  },
});
