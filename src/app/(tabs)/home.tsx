import React from "react";
import { Text } from "react-native";

import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";

/** Stub — M1 builds the real infinite feed (PLAN.md §17.1, §17.2). */
export default function HomeScreen() {
  const theme = useTheme();
  return (
    <Screen centered>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg }}>Home</Text>
    </Screen>
  );
}
