import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../ui/Button";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { useServerSetup } from "../../store/useServerSetup";

/** Shape of the JSON the web Admin page's QR code encodes (`GET /setup/qr`'s SetupQr schema, PLAN.md §17.6). */
interface ScannedSetupQr {
  lan_url?: string;
  tailscale_name?: string | null;
}

export default function ScanSetupQrScreen() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const { checkAndSaveServer } = useServerSetup();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // A CameraView fires onBarcodeScanned repeatedly for the same code while
  // it stays in frame; this guards against double-handling one scan.
  const handledRef = useRef(false);

  async function handleScanned(result: BarcodeScanningResult) {
    if (handledRef.current || checking) return;
    handledRef.current = true;

    let payload: ScannedSetupQr;
    try {
      payload = JSON.parse(result.data) as ScannedSetupQr;
    } catch {
      setError("That QR code isn't a HomeTube setup code.");
      handledRef.current = false;
      return;
    }

    if (!payload.lan_url) {
      setError("That QR code isn't a HomeTube setup code.");
      handledRef.current = false;
      return;
    }

    setChecking(true);
    const failure = await checkAndSaveServer(payload.lan_url, payload.tailscale_name ?? null);
    setChecking(false);
    if (failure) {
      setError(failure);
      handledRef.current = false;
    }
  }

  if (!permission) {
    return <Screen centered><Text style={{ color: theme.colors.text }}>Loading camera…</Text></Screen>;
  }

  if (!permission.granted) {
    return (
      <Screen centered>
        <View style={{ gap: theme.spacing[4], alignItems: "center" }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, textAlign: "center" }}>
            HomeTube needs camera access to scan your server's setup QR code.
          </Text>
          <Button label="Allow camera access" onPress={requestPermission} />
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.flex}>
      <CameraView
        style={styles.flex}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handleScanned}
      />
      <View style={[styles.overlay, { backgroundColor: theme.colors.surface }]}>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, textAlign: "center" }}>
          {checking ? "Checking server…" : "Point the camera at the QR code on your server's Admin page"}
        </Text>
        {error ? (
          <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.xs, textAlign: "center", marginTop: theme.spacing[2] }}>
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    opacity: 0.92,
  },
});
