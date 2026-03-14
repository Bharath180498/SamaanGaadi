import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface AnimatedTextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  errorText?: string;
}

export function AnimatedTextField({ label, hint, errorText, onFocus, onBlur, ...props }: AnimatedTextFieldProps) {
  const [focused, setFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: focused ? 1 : 0,
      duration: 180,
      useNativeDriver: false
    }).start();
  }, [focusAnim, focused]);

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.primary]
  });
  const glowOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.06, 0.22]
  });
  const scale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.01]
  });

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Animated.View
        style={[
          styles.inputShell,
          {
            borderColor,
            shadowOpacity: glowOpacity,
            transform: [{ scale }]
          },
          errorText ? styles.inputShellError : undefined
        ]}
      >
        <TextInput
          {...props}
          style={styles.input}
          placeholderTextColor="#94A3B8"
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
      </Animated.View>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6
  },
  label: {
    fontFamily: typography.bodyBold,
    color: colors.accent
  },
  inputShell: {
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: '#F8FAFF',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 2
  },
  inputShellError: {
    borderColor: colors.danger
  },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.body,
    color: colors.accent
  },
  hint: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.mutedText
  },
  errorText: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.danger
  }
});
