import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

/**
 * Grey-block placeholder shaped like `VideoCard`, shown while a feed
 * loads — "skeleton loaders… never spinners on the grid" (PLAN.md §10.3,
 * carried over to mobile by §17.1's Home row). Mirrors
 * `vendor/you-tube/frontend/src/app/ui/video-card/video-card-skeleton.ts`.
 */
export function VideoCardSkeleton() {
  const theme = useTheme();
  const block = { backgroundColor: theme.colors.surfaceRaised };

  return (
    <View style={styles.container}>
      <View style={[styles.thumbnail, block, { borderRadius: theme.radius.md }]} />
      <View style={[styles.metaRow, { marginTop: theme.spacing[2] }]}>
        <View style={[styles.avatar, block, { marginRight: theme.spacing[3] }]} />
        <View style={styles.lines}>
          <View style={[styles.line, block, { width: "90%" }]} />
          <View style={[styles.line, block, { width: "60%", marginTop: theme.spacing[1] }]} />
          <View style={[styles.line, block, { width: "40%", marginTop: theme.spacing[1] }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  metaRow: {
    flexDirection: "row",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  lines: {
    flex: 1,
  },
  line: {
    height: 10,
    borderRadius: 4,
  },
});
