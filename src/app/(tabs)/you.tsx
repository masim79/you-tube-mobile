import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../../ui/Button";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../store/AuthContext";

/**
 * Stub — M2 builds out History/Playlists/Watch Later/Liked/Your
 * videos/Downloads (PLAN.md §17.1). M0 only needs this tab to prove the
 * account identity + logout loop Gate M-A depends on.
 */
export default function YouScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    router.replace("/setup/login");
  }

  return (
    <Screen>
      <View style={{ gap: theme.spacing[4], marginTop: theme.spacing[6], alignItems: "center" }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700" }}>
          {user?.display_name ?? "You"}
        </Text>
        {user?.email ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>{user.email}</Text>
        ) : null}
        <Button
          testID="logout-button"
          label={loggingOut ? "Logging out…" : "Log out"}
          variant="secondary"
          onPress={handleLogout}
          loading={loggingOut}
        />
      </View>
    </Screen>
  );
}
