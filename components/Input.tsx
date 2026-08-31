import { type ReactNode, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';

interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  rightIcon?: ReactNode;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<ViewStyle>;
  /** Label sits inside the field, Mozi-style. */
  variant?: "default" | "floating";
}

export default function Input({
  label,
  icon,
  iconPosition = "left",
  rightIcon,
  error,
  variant = "default",
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  multiline,
  ...textInputProps
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const floating = variant === "floating";

  const field = (
    <>
      {icon && iconPosition === "left" && (
        <View style={[styles.iconLeft, multiline && styles.iconTopAligned]}>
          {icon}
        </View>
      )}

      <TextInput
        style={[styles.textInput, floating && styles.textInputFloating]}
        placeholderTextColor="#999"
        selectionColor={Colors.primary}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...textInputProps}
      />

      {icon && iconPosition === "right" && (
        <View style={[styles.iconRight, multiline && styles.iconTopAligned]}>
          {icon}
        </View>
      )}

      {rightIcon && (
        <View style={[styles.iconRight, multiline && styles.iconTopAligned]}>
          {rightIcon}
        </View>
      )}
    </>
  );

  return (
    <View style={containerStyle}>
      {!floating && (label || error) ? (
        <View style={styles.labelRow}>
          {label ? (
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          ) : (
            <View />
          )}
          {error ? (
            <Text style={styles.error} numberOfLines={2}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.inputRow,
          floating && styles.inputRowFloating,
          multiline && styles.inputRowMultiline,
          focused && !error && styles.inputRowFocused,
          error ? styles.inputRowError : null,
          inputStyle,
        ]}
      >
        {floating && (label || error) ? (
          <View style={styles.floatingLabelRow}>
            {label ? <Text style={styles.floatingLabel}>{label}</Text> : null}
            {error ? (
              <Text style={styles.error} numberOfLines={2}>
                {error}
              </Text>
            ) : null}
          </View>
        ) : null}
        {floating ? <View style={styles.floatingValueRow}>{field}</View> : field}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
    marginHorizontal: 2,
  },
  label: {
    flex: 1,
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 14,
  },
  inputRowFloating: {
    flexDirection: "column",
    alignItems: "stretch",
    borderRadius: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  floatingLabelRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
  },
  floatingLabel: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#999",
  },
  floatingValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputRowMultiline: {
    alignItems: "flex-start",
  },
  inputRowFocused: {
    borderColor: Colors.primary,
  },
  inputRowError: {
    borderColor: "#DC2626",
    borderWidth: 1.5,
  },
  textInput: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: Colors.dark,
    paddingVertical: 14,
  },
  textInputFloating: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    paddingVertical: 0,
  },
  iconLeft: {
    marginRight: 10,
  },
  iconRight: {
    marginLeft: 10,
  },
  iconTopAligned: {
    paddingTop: 14,
  },
  error: {
    flexShrink: 1,
    maxWidth: "62%",
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
    textAlign: "right",
  },
});
