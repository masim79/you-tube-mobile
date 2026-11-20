import React from "react";
import { Text } from "react-native";

import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";

/** Stub — M1 builds the real subscriptions feed (PLAN.md §17.1, §17.2). */
export default function SubscriptionsScreen() {
  const theme = useTheme();
  return (
    <Screen centered>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg }}>Subscriptions</Text>
    </Screen>
  );
}
