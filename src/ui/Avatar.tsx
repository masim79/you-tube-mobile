import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

export interface AvatarProps {
  uri: string | null;
  /** Used for the initial-letter fallback and the accessibility label. */
  name: string;
  size?: number;
}

/** Circular channel avatar, falling back to an initial letter on a token-colored circle when there's no image (mirrors `vendor/you-tube/frontend/src/app/ui/avatar/`). */
export function Avatar({ uri, name, size = 36 }: AvatarProps) {
  const theme = useTheme();
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={dimension}
        accessibilityLabel={name}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      style={[styles.fallback, dimension, { backgroundColor: theme.colors.surfaceRaised }]}
      accessibilityLabel={name}
    >
      <Text style={{ color: theme.colors.textSecondary, fontSize: size * 0.4, fontWeight: "600" }}>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
});
