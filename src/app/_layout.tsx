import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Bootstrap } from "../navigation/Bootstrap";
import { PushNotificationsBootstrap } from "../notifications/PushNotificationsBootstrap";
import { MiniPlayer } from "../player/MiniPlayer";
import { MiniPlayerProvider } from "../player/miniPlayerStore";
import { AuthProvider } from "../store/AuthContext";
import { ServerProvider } from "../store/ServerContext";
import { SettingsProvider } from "../store/SettingsContext";
import { ThemeProvider } from "../theme/ThemeProvider";

/**
 * Provider order matters: `AuthProvider` reads `useServer()`, so
 * `ServerProvider` must be the outer one. `Bootstrap` (inside both)
 * decides the first route on every launch (PLAN.md §17.6, Gate M-A).
 *
 * `SettingsProvider` sits directly inside `ThemeProvider` (and outside
 * everything else) — it calls `useThemeControls()` to apply the persisted
 * theme preference once its `AsyncStorage` read resolves (M2 chunk 2), and
 * nothing below it needs to exist first for that.
 *
 * `GestureHandlerRootView` is required once, at the true root, for
 * `react-native-gesture-handler`'s gestures to work anywhere in the tree —
 * added in M1 chunk 4 for the watch screen's double-tap/pan/pinch gestures
 * and the mini-player's swipe-to-dismiss.
 *
 * `MiniPlayerProvider`/`<MiniPlayer/>` sit beside `Bootstrap`, not inside
 * its `<Stack/>`, so the floating player survives every route change
 * (PLAN.md §17.1 "Mini-player") including the auth redirect in
 * `(tabs)/_layout.tsx` — `MiniPlayer` renders nothing when no video is
 * floating, so this is a no-op until `WatchScreen` opens one.
 *
 * `PushNotificationsBootstrap` (M3 chunk 1) sits beside `Bootstrap` for
 * the same reason `MiniPlayer` does — it needs `useRouter`/`useAuth`/
 * `useApiClient` (all available this deep in the tree) and must run for
 * the lifetime of the app, not scoped to one route. Renders nothing.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SettingsProvider>
          <ServerProvider>
            <AuthProvider>
              <MiniPlayerProvider>
                <Bootstrap />
                <MiniPlayer />
                <PushNotificationsBootstrap />
              </MiniPlayerProvider>
            </AuthProvider>
          </ServerProvider>
        </SettingsProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
