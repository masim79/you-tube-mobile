import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type GestureResponderEvent } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

export interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  /** Accessibility label, falls back to `label` (§17.1's accessibility floor — every phase). */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * The one button primitive M0's setup/auth/tab screens need. Every color
 * comes from `useTheme()` (which resolves `tokens.generated.ts`) — never
 * a literal hex, per §10.2/§17.4.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isPrimary ? theme.colors.accent : theme.colors.surfaceRaised,
          borderRadius: theme.radius.pill,
          paddingVertical: theme.spacing[3],
          paddingHorizontal: theme.spacing[6],
          opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1,
          // §17.1: 44pt minimum touch target.
          minHeight: 44,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.colors.accentContrast : theme.colors.text} />
      ) : (
        <Text
          style={{
            color: isPrimary ? theme.colors.accentContrast : theme.colors.text,
            fontSize: theme.fontSize.md,
            fontFamily: theme.fontFamily,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
});
