import { useRef, type ReactNode } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { CornerUpLeft } from "lucide-react-native";
import { Colors } from "../constants/Colors";

const MAX_PULL = 88;
const TRIGGER = 56;

type Props = {
  children: ReactNode;
  onReply: () => void;
  /** Fired the moment a touch lands on the row (used by the parent sheet to
   * know a leftward swipe here means "reply", not "close"). */
  onTouchStart?: () => void;
  disabled?: boolean;
  /** True while a horizontal swipe owns the touch, so the parent list can
   * lock vertical scrolling and the gesture stays one-dimensional. */
  onSwipeActiveChange?: (active: boolean) => void;
};

/**
 * Swipe a comment to the left to reply to it (like Instagram / iMessage).
 * The row follows the finger with a little resistance and springs back; once
 * pulled past the trigger distance, `onReply` fires on release.
 */
export default function SwipeToReplyRow({
  children,
  onReply,
  onTouchStart,
  disabled,
  onSwipeActiveChange,
}: Props) {
  const activeCbRef = useRef(onSwipeActiveChange);
  activeCbRef.current = onSwipeActiveChange;
  const x = useRef(new Animated.Value(0)).current;
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const springBack = () => {
    activeCbRef.current?.(false);
    Animated.spring(x, {
      toValue: 0,
      friction: 9,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !disabledRef.current &&
        g.dx < -10 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => activeCbRef.current?.(true),
      onPanResponderMove: (_, g) => {
        // Rubber-band past the trigger so it feels weighted.
        const raw = Math.min(0, g.dx);
        const pulled =
          raw > -TRIGGER ? raw : -TRIGGER + (raw + TRIGGER) * 0.35;
        x.setValue(Math.max(-MAX_PULL, pulled));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -TRIGGER) onReplyRef.current();
        springBack();
      },
      onPanResponderTerminate: springBack,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const iconOpacity = x.interpolate({
    inputRange: [-TRIGGER, -16, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: "clamp",
  });
  const iconScale = x.interpolate({
    inputRange: [-TRIGGER, -16, 0],
    outputRange: [1, 0.7, 0.5],
    extrapolate: "clamp",
  });

  return (
    <View onTouchStart={onTouchStart}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.icon,
          { opacity: iconOpacity, transform: [{ scale: iconScale }] },
        ]}
      >
        <CornerUpLeft size={20} color={Colors.primary} strokeWidth={2.4} />
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX: x }] }}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: "absolute",
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
});
