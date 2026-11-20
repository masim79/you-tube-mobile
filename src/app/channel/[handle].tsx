import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text } from "react-native";

import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";

/**
 * Stub — M1 builds the real channel screen: Home/Videos/Shorts/
 * Playlists/About tabs (PLAN.md §17.1, §17.2).
 */
export default function ChannelScreen() {
  const theme = useTheme();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return (
    <Screen centered>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>Channel: @{handle}</Text>
    </Screen>
  );
}
