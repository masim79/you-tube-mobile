import React from "react";
import { Alert, Pressable, Text } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

/**
 * Mic button for the Search screen (PLAN.md §17.1: "voice search via the
 * OS speech API"). There is no official Expo SDK 58 module for
 * speech-to-text (`expo-speech` is text-to-speech only), and the
 * community options (e.g. `expo-speech-recognition`) need a config-plugin
 * native rebuild plus microphone-permission wiring in `app.config.ts` —
 * a reasonable lift, but not one this chunk can verify without a
 * physical-device test pass (M0's own Gate M-A is still blocked on that
 * per the project's status notes), so per the task's own guidance this
 * is a clearly-labelled "not available" affordance rather than a
 * half-wired native integration. The button stays in place so a later
 * chunk can wire it up without changing this screen's layout.
 */
export function VoiceSearchButton({ onUnavailable }: { onUnavailable?: () => void }) {
  const theme = useTheme();

  const handlePress = () => {
    if (onUnavailable) {
      onUnavailable();
      return;
    }
    Alert.alert("Voice search unavailable", "Voice search isn't available in this build yet.");
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Voice search (not available in this build)"
      hitSlop={8}
      style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: theme.colors.textSecondary, fontSize: 20 }}>🎤</Text>
    </Pressable>
  );
}
