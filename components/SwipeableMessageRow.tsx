import { useRef, type ReactNode } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { CornerUpLeft } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

const REPLY_TRIGGER = 56;
/** How far the time gutter opens (shared by every row). */
export const TIME_MAX = 64;
/** Pull this much past the gutter to reply (same as swipe-left in comments). */
const LEFT_REPLY_EXTRA = 28;
/** Touches starting this close to the left edge belong to the iOS
 * swipe-back gesture, so we leave them alone. */
const EDGE_GUARD = 18;

type Props = {
  children: ReactNode;
  timeLabel: string;
  /** Sent by me → bubble slides with the gutter; received bubbles stay put. */
  mine: boolean;
  /** Shared across all rows: 0 … -TIME_MAX while any row is being dragged
   * left, so every message reveals its time together. */
  timeX: Animated.Value;
  onReply: () => void;
  /** True while a horizontal swipe owns the touch (lock list scrolling). */
  onSwipeActiveChange?: (active: boolean) => void;
};

/**
 * Chat message row.
 *  - swipe left  → every message's time slides into view; keep pulling and
 *                  release to reply (like comments)
 *  - swipe right → reply
 * Works the same for messages sent and received.
 */
export default function SwipeableMessageRow({
  children,
  timeLabel,
  mine,
  timeX,
  onReply,
  onSwipeActiveChange,
}: Props) {
  const activeCbRef = useRef(onSwipeActiveChange);
  activeCbRef.current = onSwipeActiveChange;
  /** This row's own extra movement: >0 reply pull to the right, <0 the pull
   * beyond the time gutter. */
  const x = useRef(new Animated.Value(0)).current;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const springBack = () => {
    activeCbRef.current?.(false);
    Animated.spring(x, {
      toValue: 0,
      friction: 9,
      tension: 140,
      useNativeDriver: true,
    }).start();
    Animated.spring(timeX, {
      toValue: 0,
      friction: 9,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (e, g) => {
        // `g.x0` isn't set until the responder is granted (it's 0 here), so
        // derive where the touch started from the current page x.
        const startX = e.nativeEvent.pageX - g.dx;
        return (
          Math.abs(g.dx) > 10 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.5 &&
          // My own messages only reply on a left swipe.
          !(g.dx > 0 && (mineRef.current || startX < EDGE_GUARD))
        );
      },
      onPanResponderGrant: () => {
        activeCbRef.current?.(true);
        timeX.stopAnimation();
        x.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        if (g.dx >= 0) {
          timeX.setValue(0);
          const pulled =
            g.dx < REPLY_TRIGGER
              ? g.dx
              : REPLY_TRIGGER + (g.dx - REPLY_TRIGGER) * 0.35;
          x.setValue(Math.min(90, pulled));
        } else {
          timeX.setValue(Math.max(-TIME_MAX, g.dx));
          const extra = Math.min(0, g.dx + TIME_MAX);
          x.setValue(Math.max(-48, extra * 0.6));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > REPLY_TRIGGER || g.dx < -(TIME_MAX + LEFT_REPLY_EXTRA)) {
          onReplyRef.current();
        }
        springBack();
      },
      onPanResponderTerminate: springBack,
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const translateX = mine ? Animated.add(timeX, x) : x;

  const replyLeftOpacity = x.interpolate({
    inputRange: [0, 16, REPLY_TRIGGER],
    outputRange: [0, 0.4, 1],
    extrapolate: "clamp",
  });
  const replyLeftScale = x.interpolate({
    inputRange: [0, 16, REPLY_TRIGGER],
    outputRange: [0.5, 0.7, 1],
    extrapolate: "clamp",
  });
  // Time label fades in with the gutter, then hands over to the reply arrow
  // as the pull goes past it.
  const timeBase = timeX.interpolate({
    inputRange: [-TIME_MAX, -16, 0],
    outputRange: [1, 0.3, 0],
    extrapolate: "clamp",
  });
  const timeHandover = x.interpolate({
    inputRange: [-24, 0],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const timeOpacity = Animated.multiply(timeBase, timeHandover);
  const replyRightOpacity = x.interpolate({
    inputRange: [-24, -4, 0],
    outputRange: [1, 0.2, 0],
    extrapolate: "clamp",
  });

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.replyLeft,
          { opacity: replyLeftOpacity, transform: [{ scale: replyLeftScale }] },
        ]}
      >
        <CornerUpLeft size={20} color={Colors.primary} strokeWidth={2.4} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.gutter, { opacity: timeOpacity }]}
      >
        <Text style={styles.timeText}>{timeLabel}</Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.gutter, { opacity: replyRightOpacity }]}
      >
        <CornerUpLeft size={20} color={Colors.primary} strokeWidth={2.4} />
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  replyLeft: {
    position: "absolute",
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  gutter: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  timeText: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 11,
    color: "#888",
  },
});
