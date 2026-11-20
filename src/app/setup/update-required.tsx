import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { CLIENT_VERSION } from "../../constants/client";

/**
 * Blocking "update required" screen (PLAN.md §17.5): shown when this
 * build's version is below the server's `min_client_version_mobile`.
 * There is no "continue anyway" — an installed app outliving an API
 * change is exactly the failure mode §17.7 calls out, and the server is
 * free to have removed/repurposed something this build still assumes.
 * No action here beyond waiting for a new build; `expo-updates` OTA
 * (§17.5) is what would actually resolve this for a JS-only change.
 */
export default function UpdateRequiredScreen() {
  const theme = useTheme();
  const { minVersion } = useLocalSearchParams<{ minVersion?: string }>();

  return (
    <Screen centered>
      <View style={{ gap: theme.spacing[3], alignItems: "center" }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: "700", textAlign: "center" }}>
          Update required
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: "center" }}>
          This server now requires HomeTube {minVersion ?? "a newer version"}. You're running {CLIENT_VERSION}.
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: "center" }}>
          Install the latest build to continue.
        </Text>
      </View>
    </Screen>
  );
}
