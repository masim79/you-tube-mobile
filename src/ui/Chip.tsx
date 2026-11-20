import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

export interface ChipProps {
  label: string;
  active?: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * Pill-shaped filter/sort chip (mirrors `vendor/you-tube/frontend/src/app/ui/chip/`
 * — §10.1's chip bar, §10.2 rule 1's shared-component-only). Used for the
 * Home feed's sort row; token-styled, no literal color.
 */
export function Chip({ label, active = false, onPress, testID }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      // §17.1: 44pt minimum touch target — the pill itself is shorter
      // than that visually, so hitSlop makes up the difference.
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: active ? theme.colors.text : theme.colors.surfaceRaised,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing[4],
          paddingVertical: theme.spacing[2],
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: active ? theme.colors.bg : theme.colors.text,
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSize.sm,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
  },
});
