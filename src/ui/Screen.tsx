import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "../theme/ThemeProvider";

/** Token-backgrounded, safe-area-respecting screen container used by every M0 screen. */
export function Screen({ children, centered = false }: { children: React.ReactNode; centered?: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.bg }]}>
      <View
        style={[
          styles.flex,
          { padding: theme.spacing[4] },
          centered && styles.centered,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
});
