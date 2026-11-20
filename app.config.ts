import type { ConfigContext, ExpoConfig } from "expo/config";

// PLAN.md §17.3/§17.5/§17.7 — app id, icons, permissions, and the
// cleartext/ATS allowances a plain-HTTP LAN server needs.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "HomeTube",
  slug: "hometube-mobile",
  // Bump on every store-relevant release; compared against the server's
  // `min_client_version_mobile` on launch (§17.5, src/constants/client.ts).
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "hometube",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.hometube.mobile",
    supportsTablet: true,
    infoPlist: {
      // §17.7: the server is plain HTTP on the LAN. NSAllowsLocalNetworking
      // relaxes ATS specifically for hosts that resolve to a private,
      // loopback or link-local address (and `.local` mDNS names) without
      // weakening ATS for anything else the app might ever talk to over
      // the public internet (e.g. the Expo push service, §17.6).
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    package: "com.hometube.mobile",
    adaptiveIcon: {
      backgroundColor: "#0f0f0f",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: ["android.permission.CAMERA"],
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0f0f0f",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission:
          "HomeTube uses the camera to scan your server's setup QR code.",
        // QR scanning only — no microphone/audio-recording permission needed.
        recordAudioAndroid: false,
      },
    ],
    "expo-video",
    [
      "expo-build-properties",
      {
        android: {
          // §17.7: Android blocks cleartext (plain-HTTP) traffic by
          // default since API 28. The server's address is whatever LAN
          // IP or hostname the user enters or scans at first run (§17.1),
          // which rules out a `networkSecurityConfig` scoped to specific
          // literal hostnames/IPs or CIDR ranges — Android's schema has
          // no range syntax, only exact `<domain>`/`<ip-address>` entries.
          // `usesCleartextTraffic` is the documented, supported
          // alternative for exactly this "arbitrary private-network HTTP
          // server" case; it only affects this app's own outbound
          // requests, not the device generally.
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
