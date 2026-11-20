import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../../ui/Button";
import { Screen } from "../../ui/Screen";
import { TextField } from "../../ui/TextField";
import { useTheme } from "../../theme/ThemeProvider";
import { useServerSetup } from "../../store/useServerSetup";

/**
 * First-run server setup (PLAN.md §17.1/§17.6). Two ways in: type the
 * server's LAN URL directly, or scan the QR code the web Admin page
 * shows (`setup/scan.tsx`) — this screen only owns the manual path plus
 * the entry point into scanning.
 */
export default function SetupIndexScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { checkAndSaveServer } = useServerSetup();

  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleContinue() {
    setError(null);
    setChecking(true);
    const failure = await checkAndSaveServer(url);
    setChecking(false);
    if (failure) setError(failure);
  }

  return (
    <Screen>
      <View style={{ gap: theme.spacing[4], marginTop: theme.spacing[6] }}>
        <Text
          style={{ color: theme.colors.text, fontSize: theme.fontSize.xl, fontFamily: theme.fontFamily, fontWeight: "700" }}
        >
          Find your HomeTube server
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily }}>
          Enter the server's LAN address, or scan the QR code shown on its Admin page. If you're away from home, use
          its Tailscale name instead.
        </Text>

        <TextField
          testID="setup-server-url-input"
          label="Server address"
          placeholder="http://192.168.1.42"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
          errorMessage={error}
        />

        <Button
          testID="setup-continue-button"
          label={checking ? "Checking…" : "Continue"}
          onPress={handleContinue}
          loading={checking}
        />
        <Button
          testID="setup-scan-qr-button"
          label="Scan QR code instead"
          variant="secondary"
          onPress={() => router.push("/setup/scan")}
        />
      </View>
    </Screen>
  );
}
