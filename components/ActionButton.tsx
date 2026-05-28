import { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

/**
 * Vertical icon-over-label action button used in the row of community
 * actions (Edit / Events / Details / Members / Share / Delete / etc.).
 *
 * Visually it matches the rest of the app's `Button` component — same
 * Duolingo-style 3D press where the face springs down to meet a darker
 * shadow plate — but it's shaped like a slightly-rounded tile instead of
 * a pill, and stacks the icon above the label.
 */
type ActionVariant = "primary" | "accent" | "subtle" | "delete";

type HapticStrength = "light" | "medium" | "heavy" | false;

/** Shape we expect for lucide-react-native icons (and anything else that
 * implements the same prop surface). Letting us own the size/color/stroke
 * keeps the icon visually consistent with the chosen variant. */
type ActionIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type Props = {
  label: string;
  /** Pass an icon component (e.g. `Pencil` from lucide-react-native) — the
   * button colors and sizes it according to the active variant. */
  icon: ActionIcon;
  onPress?: () => void;
  variant?: ActionVariant;
  disabled?: boolean;
  /** Tactile feedback fired on press-in. `false` disables it. */
  haptic?: HapticStrength;
  /** Fixed tile width. Default tuned so 4-5 fit comfortably in a row on
   * a 6.1" screen with horizontal scrolling for the rest. */
  width?: number;
  /** Override the default icon + label color for this variant. Mainly
   * useful on `subtle` to render destructive actions (e.g. red Delete /
   * Leave) without inventing a 4th variant. */
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** How far the face travels down on press — matches the shadow plate offset.
 * Same value as `Button.tsx` so action buttons feel identical to the regular
 * buttons elsewhere in the app. */
const PRESS_DEPTH = 0;
/** Rounded but not pill — gives the tile a friendlier, less rigid look. */
const TILE_RADIUS = 800000;

function darkenHex(hex: string, amount: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  if (full.length !== 6) return hex;

  const r = Math.max(
    0,
    Math.round(parseInt(full.slice(0, 2), 16) * (1 - amount)),
  );
  const g = Math.max(
    0,
    Math.round(parseInt(full.slice(2, 4), 16) * (1 - amount)),
  );
  const b = Math.max(
    0,
    Math.round(parseInt(full.slice(4, 6), 16) * (1 - amount)),
  );

  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const variantStyles: Record<
  ActionVariant,
  { background: string; shadow: string; tint: string }
> = {
  primary: {
    background: Colors.primary,
    shadow: darkenHex(Colors.primary, 0.22),
    tint: "#fff",
  },
  accent: {
    background: Colors.accent,
    shadow: darkenHex(Colors.accent, 0.22),
    tint: "#fff",
  },
  subtle: {
    background: "#FAFAFA",
    shadow: darkenHex("#FAFAFA", 0.08),
    tint: Colors.dark,
  },
  delete: {
    background: "#BD0202",
    shadow: darkenHex("#BD0202", 0.18),
    tint: "#fff",
  },
};

function triggerHaptic(strength: HapticStrength) {
  if (!strength) return;
  try {
    const map = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    } as const;
    void Haptics.impactAsync(map[strength]);
  } catch {
    // Haptics unavailable on this platform — silent.
  }
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ActionButton({
  label,
  icon: Icon,
  onPress,
  variant = "subtle",
  disabled = false,
  haptic = "light",
  width = 68,
  tintColor,
  style,
}: Props) {
  const v = variantStyles[variant];
  const tint = tintColor ?? v.tint;
  const pressAnim = useRef(new Animated.Value(0)).current;

  const resetPressAnim = useCallback(() => {
    pressAnim.stopAnimation();
    pressAnim.setValue(0);
  }, [pressAnim]);

  // If the button becomes disabled mid-press, snap the face back so it
  // never gets stuck in the depressed position.
  useEffect(() => {
    if (disabled) resetPressAnim();
  }, [disabled, resetPressAnim]);

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    triggerHaptic(haptic);
    Animated.spring(pressAnim, {
      toValue: PRESS_DEPTH,
      speed: 40,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  }, [pressAnim, haptic, disabled]);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressAnim, {
      toValue: 0,
      speed: 22,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [pressAnim]);

  return (
    <View
      style={[
        styles.depthShell,
        { width, marginBottom: PRESS_DEPTH },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.shadowPlate,
          {
            backgroundColor: v.shadow,
            borderRadius: TILE_RADIUS,
            // Sits exactly PRESS_DEPTH pixels below the face — when the
            // face springs down on press, the two meet flush.
            transform: [{ translateY: PRESS_DEPTH }],
          },
        ]}
      />

      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[
          styles.face,
          {
            backgroundColor: v.background,
            borderRadius: TILE_RADIUS,
            transform: [{ translateY: pressAnim }],
          },
          disabled && styles.disabled,
        ]}
      >
        <Icon size={20} color={tint} />
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  depthShell: {
    position: "relative",
    alignSelf: "auto",
  },
  shadowPlate: {
    ...StyleSheet.absoluteFillObject,
  },
  face: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 2,
    gap: 6,
    zIndex: 1,
  },
  label: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});
