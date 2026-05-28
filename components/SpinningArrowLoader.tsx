import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { RotateCw } from "lucide-react-native";
import { Colors } from "../constants/Colors";

type Props = {
  /** Icon size in px. Default tuned for inline list/empty placements. */
  size?: number;
  /** Stroke color. Defaults to the brand accent (orange). */
  color?: string;
  /** Whether the loader should be visible. When toggled off the loader plays
   * a subtle scale-out before unmounting so the disappearance reads as a
   * deliberate transition rather than a yank. */
  visible?: boolean;
  /** Duration of one full rotation in ms. Smaller = faster spin. */
  durationMs?: number;
  /** Stroke weight of the icon. */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A self-contained spinning arrow used as the app's "we're loading" indicator.
 *
 * Two animations run in parallel:
 * - A continuous linear rotation (native driver) for the spin itself.
 * - A spring on the wrapper's `scale` for the enter / exit transition. We
 *   deliberately avoid an opacity fade — the loader pops in and out with a
 *   subtle scale instead, matching the brand's tactile feel and keeping the
 *   spinner visually distinct from a generic activity indicator.
 */
export default function SpinningArrowLoader({
  size = 28,
  color = Colors.accent,
  visible = true,
  durationMs = 900,
  strokeWidth = 2.4,
  style,
}: Props) {
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(visible ? 1 : 0)).current;

  // Continuous rotation. We deliberately restart the loop whenever the
  // loader transitions to "visible" — this defends against a native-driver
  // quirk where the rotation animation gets disconnected from its view if
  // the loader is hidden/shown rapidly (e.g. tap-to-refresh), causing the
  // spin to silently stop on the second appearance. Resetting the value
  // and re-starting the loop guarantees the icon is always actually
  // spinning when the user can see it.
  useEffect(() => {
    if (!visible) return undefined;
    rotate.setValue(0);
    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      { iterations: -1 },
    );
    loop.start();
    return () => loop.stop();
  }, [rotate, durationMs, visible]);

  // Subtle scale-only enter/exit. We never unmount — toggling mount state
  // around a native-driven loop causes the same disconnection issue, so we
  // just shrink to 0 and let the wrapper sit there invisibly.
  useEffect(() => {
    Animated.spring(scale, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      bounciness: visible ? 8 : 0,
      speed: visible ? 18 : 24,
    }).start();
  }, [visible, scale]);

  const rotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={[styles.wrap, { transform: [{ scale }] }, style]}
      pointerEvents="none"
    >
      <Animated.View style={{ transform: [{ rotate: rotation }] }}>
        <RotateCw size={size} color={color} strokeWidth={strokeWidth} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
