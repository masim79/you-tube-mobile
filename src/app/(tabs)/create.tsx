import React from "react";
import { Text } from "react-native";

import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";

/** Stub — M1 builds real upload (camera roll / in-app record, resumable via tusd, PLAN.md §17.1). */
export default function CreateScreen() {
  const theme = useTheme();
  return (
    <Screen centered>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg }}>Create</Text>
    </Screen>
  );
}
