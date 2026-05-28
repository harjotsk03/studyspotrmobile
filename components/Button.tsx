import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';

type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link' | 'accent';
type Size = 'sm' | 'default' | 'lg' | 'icon';

type HapticStrength = 'light' | 'medium' | 'heavy' | 'selection' | false;

interface ButtonProps {
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  children?: ReactNode;
  label?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
  /** Tactile feedback fired on press-in. Set to `false` to disable. */
  haptic?: HapticStrength;
}

function triggerHaptic(strength: HapticStrength) {
  if (!strength) return;
  // Fire and forget — we never want to block the press response on this.
  try {
    if (strength === 'selection') {
      void Haptics.selectionAsync();
      return;
    }
    const map = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    } as const;
    void Haptics.impactAsync(map[strength]);
  } catch {
    // Some platforms (older Android, web) don't support haptics — silent.
  }
}

/** How far the face travels down on press — matches the shadow plate offset. */
const PRESS_DEPTH = 4;

const variantStyles: Record<
  Variant,
  {
    container: ViewStyle;
    text: TextStyle;
    shadowColor?: string;
    depth?: boolean;
  }
> = {
  default: {
    container: {
      backgroundColor: Colors.primary,
      borderWidth: 1.25,
      borderColor: Colors.primary,
    },
    text: { color: "#fff" },
    shadowColor: darkenHex(Colors.primary, 0.22),
    depth: true,
  },
  secondary: {
    container: {
      backgroundColor: "#fcfcfc",
      borderWidth: 1.25,
      borderColor: "#fcfcfc",
    },
    text: { color: Colors.dark },
    shadowColor: darkenHex("#fcfcfc", 0.18),
    depth: true,
  },
  outline: {
    container: {
      backgroundColor: "#fff",
      borderWidth: 1.25,
      borderColor: Colors.dark,
    },
    text: { color: Colors.dark },
    shadowColor: darkenHex(Colors.dark, 0.55),
    depth: true,
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    text: { color: Colors.dark },
    depth: false,
  },
  destructive: {
    container: { backgroundColor: "#DC2626", borderWidth: 1.25, borderColor: "#DC2626" },
    text: { color: "#fff" },
    shadowColor: darkenHex("#DC2626", 0.24),
    depth: true,
  },
  link: {
    container: {
      backgroundColor: "transparent",
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    text: { color: Colors.primary, textDecorationLine: "underline" },
    depth: false,
  },
  accent: {
    container: { backgroundColor: Colors.accent, borderWidth: 1.25, borderColor: Colors.accent },
    text: { color: "#fff" },
    shadowColor: darkenHex(Colors.accent, 0.22),
    depth: true,
  },
};

const sizeStyles: Record<Size, { container: ViewStyle; text: TextStyle; iconSize: number }> = {
  sm: {
    container: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
    text: { fontSize: 13 },
    iconSize: 16,
  },
  default: {
    container: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
    text: { fontSize: 14 },
    iconSize: 18,
  },
  lg: {
    container: { paddingVertical: 16, paddingHorizontal: 28, borderRadius: 10 },
    text: { fontSize: 17 },
    iconSize: 22,
  },
  icon: {
    container: { padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    text: { fontSize: 0 },
    iconSize: 20,
  },
};

function darkenHex(hex: string, amount: number): string {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  if (full.length !== 6) return hex;

  const r = Math.max(0, Math.round(parseInt(full.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(full.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(full.slice(4, 6), 16) * (1 - amount)));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`;
}

export default function Button({
  onPress,
  variant = 'default',
  size = 'default',
  disabled = false,
  loading = false,
  children,
  label,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  fullWidth = false,
  haptic = 'light',
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = disabled || loading;
  // The visual "dimmed" treatment is only for the explicit `disabled` state
  // — while merely `loading`, the button face stays at full opacity so the
  // spinner reads against a normal-looking surface. Interaction is still
  // blocked via `isDisabled` on the Pressable below.
  const showDisabledFade = disabled && !loading;
  // Keep the 3D shell even while loading/disabled so we don't swap component
  // trees mid-press (which drops onPressOut and leaves pressAnim stuck).
  const hasDepth = Boolean(v.depth && v.shadowColor);
  const borderRadius =
    typeof s.container.borderRadius === 'number' ? s.container.borderRadius : 8;

  // Animated translateY for the face. We spring between 0 (rest) and
  // PRESS_DEPTH (pressed) for a tactile, Duolingo-like feel instead of
  // snapping with a static `pressed` style.
  const pressAnim = useRef(new Animated.Value(0)).current;

  const resetPressAnim = useCallback(() => {
    pressAnim.stopAnimation();
    pressAnim.setValue(0);
  }, [pressAnim]);

  // Safety net: if the button becomes disabled/loading while a finger is
  // still down (e.g. async validation on Register step 1→2), the face must
  // snap back to rest even if onPressOut never fires on the depth pressable.
  useEffect(() => {
    if (isDisabled) resetPressAnim();
  }, [isDisabled, resetPressAnim]);

  const handlePressIn = useCallback(() => {
    if (isDisabled) return;
    triggerHaptic(haptic);
    Animated.spring(pressAnim, {
      toValue: PRESS_DEPTH,
      // Stiff + low-mass spring lands the press feel snappy on the way
      // down (no overshoot needed since the face is meeting the shadow).
      speed: 20,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  }, [pressAnim, haptic, isDisabled]);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressAnim, {
      toValue: 0,
      // Slightly springier release for the satisfying "pop back" cue.
      speed: 22,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [pressAnim]);

  const content = children ?? (label ? (
    <Text style={[styles.text, s.text, v.text, showDisabledFade && styles.disabledText, textStyle]}>
      {label}
    </Text>
  ) : null);

  const inner = loading ? (
    <ActivityIndicator size="small" color={v.text.color as string} />
  ) : (
    <View style={styles.inner}>
      {icon && iconPosition === 'left' && (
        <View style={content ? styles.iconLeft : undefined}>{icon}</View>
      )}
      {content}
      {icon && iconPosition === 'right' && (
        <View style={content ? styles.iconRight : undefined}>{icon}</View>
      )}
    </View>
  );

  if (!hasDepth) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={() => triggerHaptic(haptic)}
        disabled={isDisabled}
        style={[
          styles.base,
          s.container,
          v.container,
          fullWidth && styles.fullWidth,
          showDisabledFade && styles.disabled,
          style,
        ]}
      >
        {inner}
      </Pressable>
    );
  }

  // Outer wrapper owns layout-level styles (margin, positioning, width) so
  // the absolutely-positioned shadow plate fills only the face area, not
  // any margin space the parent screen attaches via `style`. Visual props
  // (background, border) intentionally stay on the face via the variant /
  // size styles below.
  return (
    <View
      style={[
        styles.depthShell,
        fullWidth && styles.fullWidthShell,
        { marginBottom: PRESS_DEPTH },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.shadowPlate,
          {
            backgroundColor: v.shadowColor,
            borderRadius,
            transform: [{ translateY: PRESS_DEPTH }],
          },
        ]}
      />

      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[
          styles.base,
          styles.face,
          s.container,
          v.container,
          fullWidth && styles.fullWidth,
          showDisabledFade && styles.disabled,
          { transform: [{ translateY: pressAnim }] },
        ]}
      >
        {inner}
      </AnimatedPressable>
    </View>
  );
}

/** Wrap Pressable in Animated so we can spring its transform natively. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  depthShell: {
    position: 'relative',
    // Keep default RN alignSelf behavior ("auto") so the button still
    // stretches in parents that use the default alignItems: "stretch"
    // (e.g. login form column). Using flex-start here caused width
    // regressions after introducing the depth wrapper.
    alignSelf: 'auto',
  },
  fullWidthShell: {
    alignSelf: 'stretch',
    width: '100%',
  },
  shadowPlate: {
    ...StyleSheet.absoluteFillObject,
  },
  face: {
    zIndex: 1,
  },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontFamily: Fonts.gabarito.medium,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.8,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});
