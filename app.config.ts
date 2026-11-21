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
        // M1 chunk 7 (Create/Upload): the camera is now also used to record
        // a video in-app (`CameraView.recordAsync`, `src/app/(tabs)/create.tsx`),
        // not just to scan the setup QR code, so microphone access is
        // needed too — `recordAudioAndroid` flipped from its M0-era `false`.
        cameraPermission:
          "HomeTube uses the camera to scan your server's setup QR code and to record videos.",
        microphonePermission:
          "HomeTube uses the microphone to record audio for videos you record in-app.",
        recordAudioAndroid: true,
      },
    ],
    [
      "expo-image-picker",
      {
        // M1 chunk 7: picking an existing video from the camera roll to upload.
        photosPermission:
          "HomeTube uses your photo library to pick a video to upload.",
      },
    ],
    // M1 chunk 7: the upload progress notification (`src/upload/uploadNotifications.ts`).
    // No custom icon/color/sound configured — the platform default is fine for a
    // transient progress notification.
    "expo-notifications",
    [
      "expo-video",
      {
        // PLAN.md §17.1 "Background & PiP" / §17.7: audio must keep playing
        // with the app backgrounded or the screen locked, with lock-screen
        // controls, plus Picture-in-Picture on both platforms. Both flags
        // are read by `expo-video`'s own config plugin
        // (`node_modules/expo-video/plugin/build/withExpoVideo.js`), which
        // derives everything platform-specific from them rather than this
        // file hand-rolling it:
        //  - iOS: adds `UIBackgroundModes: ["audio"]` to Info.plist when
        //    either flag is true (no manual `infoPlist` entry needed here).
        //  - Android: sets the main activity's
        //    `android:supportsPictureInPicture` from
        //    `supportsPictureInPicture`, and — only when
        //    `supportsBackgroundPlayback` is true — adds the
        //    `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_MEDIA_PLAYBACK`
        //    permissions plus the `ExpoVideoPlaybackService` foreground
        //    service + media3 `MediaSessionService` intent filter that
        //    backs both continued background playback and the lock-screen/
        //    notification transport controls (`VideoPlayer.
        //    showNowPlayingNotification`, set in `src/player/VideoPlayer.tsx`).
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
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
