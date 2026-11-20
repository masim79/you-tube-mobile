import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import { useAuth } from "../../store/AuthContext";
import { useTheme } from "../../theme/ThemeProvider";

/** Plain-text glyph tab icons — M0 has no icon library yet (added when M1 builds out real tab content). */
const GLYPH: Record<string, string> = {
  home: "⌂",
  shorts: "▭",
  create: "+",
  subscriptions: "☰",
  you: "☺",
};

export default function TabsLayout() {
  const { isAuthenticated } = useAuth();
  const theme = useTheme();

  // M0's auth guard: the tab shell is the authenticated area of the app.
  // Anything that lands here unauthenticated (e.g. a deep link, or state
  // lost on an unexpected relaunch) goes to the login screen instead of
  // rendering stub content it has no session for.
  if (!isAuthenticated) {
    return <Redirect href="/setup/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: "Home", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{GLYPH.home}</Text> }}
      />
      <Tabs.Screen
        name="shorts"
        options={{ title: "Shorts", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{GLYPH.shorts}</Text> }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          // §17.4: "the centre Create button visually distinct" — a
          // raised accent-colored circle rather than a same-as-everyone-
          // else glyph+label, the same idea as YouTube's own center tab
          // (the interaction pattern, not the asset).
          tabBarIcon: () => (
            <View
              style={{
                width: 36,
                height: 28,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: theme.colors.accentContrast, fontSize: 18, fontWeight: "700" }}>
                {GLYPH.create}
              </Text>
            </View>
          ),
          tabBarAccessibilityLabel: "Create",
        }}
      />
      <Tabs.Screen
        name="subscriptions"
        options={{
          title: "Subscriptions",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{GLYPH.subscriptions}</Text>,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{ title: "You", tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{GLYPH.you}</Text> }}
      />
    </Tabs>
  );
}
