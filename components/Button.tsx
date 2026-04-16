import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';

type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link' | 'accent';
type Size = 'sm' | 'default' | 'lg' | 'icon';

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
}

const variantStyles: Record<Variant, { container: ViewStyle; text: TextStyle }> = {
  default: {
    container: { backgroundColor: Colors.primary },
    text: { color: '#fff' },
  },
  secondary: {
    container: { backgroundColor: "#f9f9f9" },
    text: { color: Colors.dark },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.dark },
    text: { color: Colors.dark },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: Colors.dark },
  },
  destructive: {
    container: { backgroundColor: '#DC2626' },
    text: { color: '#fff' },
  },
  link: {
    container: { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
    text: { color: Colors.primary, textDecorationLine: 'underline' },
  },
  accent: {
    container: { backgroundColor: Colors.accent },
    text: { color: '#fff' },
  },
};

const sizeStyles: Record<Size, { container: ViewStyle; text: TextStyle; iconSize: number }> = {
  sm: {
    container: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12 },
    text: { fontSize: 13 },
    iconSize: 16,
  },
  default: {
    container: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 },
    text: { fontSize: 16 },
    iconSize: 18,
  },
  lg: {
    container: { paddingVertical: 16, paddingHorizontal: 28, borderRadius: 14 },
    text: { fontSize: 17 },
    iconSize: 22,
  },
  icon: {
    container: { padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    text: { fontSize: 0 },
    iconSize: 20,
  },
};

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
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = disabled || loading;

  const content = children ?? (label ? (
    <Text style={[styles.text, s.text, v.text, isDisabled && styles.disabledText, textStyle]}>
      {label}
    </Text>
  ) : null);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.base,
        s.container,
        v.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={v.text.color as string}
        />
      ) : (
        <View style={styles.inner}>
          {icon && iconPosition === 'left' && <View style={content ? styles.iconLeft : undefined}>{icon}</View>}
          {content}
          {icon && iconPosition === 'right' && <View style={content ? styles.iconRight : undefined}>{icon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
    flex: 1,
    alignSelf: 'stretch',
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
