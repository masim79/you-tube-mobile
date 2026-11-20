import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text } from "react-native";

import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";

/**
 * Stub — M1 builds the real watch screen: player, gestures, mini-player,
 * background audio/PiP, engagement, comments (PLAN.md §17.1, §17.2).
 */
export default function WatchScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen centered>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>Watch: {id}</Text>
    </Screen>
  );
}
