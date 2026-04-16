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

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<ViewStyle>;
}

export default function Input({
  label,
  icon,
  iconPosition = 'left',
  error,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...textInputProps
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          error && styles.inputRowError,
          inputStyle,
        ]}
      >
        {icon && iconPosition === 'left' && (
          <View style={styles.iconLeft}>{icon}</View>
        )}

        <TextInput
          style={styles.textInput}
          placeholderTextColor="#999"
          selectionColor={Colors.primary}
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

        {icon && iconPosition === 'right' && (
          <View style={styles.iconRight}>{icon}</View>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 14,
  },
  inputRowFocused: {
    borderColor: Colors.primary,
  },
  inputRowError: {
    borderColor: '#DC2626',
  },
  textInput: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: Colors.dark,
    paddingVertical: 14,
  },
  iconLeft: {
    marginRight: 10,
  },
  iconRight: {
    marginLeft: 10,
  },
  error: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
    marginLeft: 2,
  },
});
