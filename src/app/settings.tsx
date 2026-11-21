import { Stack, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../ui/Screen";
import { useTheme } from "../theme/ThemeProvider";

/**
 * Settings placeholder — the You tab's "Settings" row needs somewhere to
 * land now, but the real screen (theme override, server/account
 * management, etc.) is M2 chunk 2's deliverable, not this chunk's
 * (PLAN.md §17.1/§17.2). An honest "coming soon" rather than a dead link.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen centered>
        <View style={[styles.header, { marginBottom: theme.spacing[4] }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/you"))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.iconButton}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20 }}>←</Text>
          </Pressable>
        </View>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700" }}>Settings</Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.sm,
            textAlign: "center",
            marginTop: theme.spacing[2],
          }}
        >
          Coming in a later update.
        </Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
