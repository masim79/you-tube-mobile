import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

export interface RemoveButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
  loading?: boolean;
  testID?: string;
}

/**
 * Small circular "✕" overlay button — the per-item removal affordance for
 * M2 chunk 1's library screens (History, Watch Later, Playlist detail),
 * used as `VideoList`'s `trailingAction`. Token-styled like `VideoCard`'s
 * duration badge (`theme.colors.bg` at reduced alpha behind `theme.colors.text`)
 * rather than a fixed black/white pair, so it still reads correctly in
 * light theme.
 */
export function RemoveButton({ onPress, accessibilityLabel = "Remove", loading = false, testID }: RemoveButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        {
          margin: theme.spacing[2],
          backgroundColor: `${theme.colors.bg}cc`,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.text} />
      ) : (
        <Text style={[styles.glyph, { color: theme.colors.text }]}>✕</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    fontSize: 14,
    fontWeight: "700",
  },
});
