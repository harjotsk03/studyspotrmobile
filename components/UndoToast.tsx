import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import Button from "./Button";

type Props = {
  /** When true the toast slides up; when false it slides back down. */
  visible: boolean;
  /** Body copy of the toast. Short, single sentence — "Notification deleted". */
  message: string;
  /** Tapping the Undo button. Should reverse the destructive action. */
  onUndo: () => void;
  /** Called when the auto-dismiss timer expires (parent should set visible
   * to false). Not invoked when the user taps Undo. */
  onHide: () => void;
  /** Auto-dismiss timer in ms. Defaults to 4000 — long enough to catch the
   * mistake, short enough that the toast doesn't linger. */
  durationMs?: number;
  /** Extra positioning overrides. Mainly so callers can lift the toast
   * above a bottom tab bar with the right spacing. */
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_DURATION = 4000;
const ENTER_DURATION = 220;
const EXIT_DURATION = 180;
/** How far below the resting position the toast starts/ends. Large enough
 * that the slide reads as "from off-screen below the tab bar". */
const HIDDEN_OFFSET = 96;

export default function UndoToast({
  visible,
  message,
  onUndo,
  onHide,
  durationMs = DEFAULT_DURATION,
  style,
}: Props) {
  const translateY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any running auto-dismiss timer so changes to `visible` always
    // win against a stale timer that might be about to call onHide.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ENTER_DURATION,
          useNativeDriver: true,
        }),
      ]).start();

      timerRef.current = setTimeout(() => {
        onHide();
      }, durationMs);
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: HIDDEN_OFFSET,
          duration: EXIT_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: EXIT_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, durationMs, onHide, translateY, opacity]);

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={[
        styles.wrap,
        { opacity, transform: [{ translateY }] },
        style,
      ]}
    >
      <View style={styles.toast}>
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        <Button
          label="Undo"
          variant="accent"
          size="sm"
          onPress={onUndo}
          haptic="medium"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: Colors.dark,
    borderRadius: 14,
    paddingVertical: 10,
    paddingLeft: 18,
    paddingRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  message: {
    flex: 1,
    color: "#fff",
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
  },
});
