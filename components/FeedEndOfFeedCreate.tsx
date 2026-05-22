import { Animated, StyleSheet, View } from "react-native";
import { ChevronsUp } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

type Props = {
  /** 0..1+ progress driven by overscroll past the bottom of the feed.
   * Owned by the parent FeedScreen so we can drive it from the scroll
   * event handler. */
  dragProgress: Animated.Value;
  /** True once the user has crossed the trigger threshold; flips the copy
   * from "Keep pulling" → "Release to create" and switches color. */
  readyToTrigger: boolean;
};

/** A deliberately hidden bottom-of-feed easter egg. There's nothing for
 * the user to see at rest — just a small breathing block of whitespace
 * after the last post. As they overscroll past the bottom (iOS bounce),
 * a chevron + tiny hint fade in. Keep pulling and the copy flips to
 * "Release to create"; releasing the drag opens the composer modal. */
export default function FeedEndOfFeedCreate({
  dragProgress,
  readyToTrigger,
}: Props) {
  // Outer fade — nothing renders until the user has actually started a
  // pull. We let it tick on very slightly even at low progress so the
  // first hint of motion feels responsive.
  const containerOpacity = dragProgress.interpolate({
    inputRange: [0, 0.08, 1],
    outputRange: [0, 0.25, 1],
    extrapolate: "clamp",
  });

  const containerTranslate = dragProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, -6],
    extrapolate: "clamp",
  });

  // Chevron lifts upward and grows as the gesture progresses.
  const chevronTranslate = dragProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [6, -22],
    extrapolate: "clamp",
  });

  const chevronScale = dragProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.3],
    extrapolate: "clamp",
  });

  // Two cross-fading labels so the same vertical slot can show either
  // "Keep pulling" or "Release to create" without layout shift.
  const hintOpacity = dragProgress.interpolate({
    inputRange: [0, 0.35, 0.9, 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: "clamp",
  });

  const releaseOpacity = dragProgress.interpolate({
    inputRange: [0.9, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.inner,
          {
            opacity: containerOpacity,
            transform: [{ translateY: containerTranslate }],
          },
        ]}
      >
        <Animated.View
          style={{
            transform: [
              { translateY: chevronTranslate },
              { scale: chevronScale },
            ],
          }}
        >
          <ChevronsUp
            size={24}
            color={readyToTrigger ? Colors.accent : Colors.dark}
            strokeWidth={2.4}
          />
        </Animated.View>
        <View style={styles.labelStack}>
          <Animated.Text style={[styles.hint, { opacity: hintOpacity }]}>
            Keep pulling to create
          </Animated.Text>
          <Animated.Text
            style={[styles.hint, styles.release, { opacity: releaseOpacity }]}
          >
            Release to create
          </Animated.Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Fixed height so the footer takes the same space whether or not the
    // user is dragging — the inner content just fades in on top of it.
    height: 72,
    width: "100%",
    backgroundColor: "#fff",
  },
  inner: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 14,
    alignItems: "center",
  },
  labelStack: {
    position: "relative",
    height: 16,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    position: "absolute",
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    color: "#999",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  release: {
    color: Colors.accent,
    fontFamily: Fonts.gabarito.bold,
  },
});
