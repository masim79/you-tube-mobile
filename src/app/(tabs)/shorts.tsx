import React from "react";
import { Text } from "react-native";

import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";

/** Stub — M4 builds the real vertical swipe feed (PLAN.md §17.1, §17.2). */
export default function ShortsScreen() {
  const theme = useTheme();
  return (
    <Screen centered>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg }}>Shorts</Text>
    </Screen>
  );
}
