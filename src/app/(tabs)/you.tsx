import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../api/useApiClient";
import { unregisterPushNotifications } from "../../notifications/pushRegistration";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { resolveMediaUrl } from "../../ui/format";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../store/AuthContext";

type RowHref =
  | "/you/history"
  | "/you/watch-later"
  | "/you/liked"
  | "/you/playlists"
  | "/you/videos"
  | "/you/comments"
  | "/you/downloads"
  | "/you/live"
  | "/settings";

interface RowDef {
  key: string;
  label: string;
  glyph: string;
  /** `undefined` for a not-yet-built destination, rendered as a disabled "coming soon" row instead of a link. */
  href?: RowHref;
}

const ROWS: RowDef[] = [
  { key: "history", label: "History", glyph: "🕒", href: "/you/history" },
  { key: "watch-later", label: "Watch Later", glyph: "🕓", href: "/you/watch-later" },
  { key: "liked", label: "Liked videos", glyph: "👍", href: "/you/liked" },
  { key: "playlists", label: "Playlists", glyph: "▤", href: "/you/playlists" },
  // Studio-lite (M2 chunk 3, PLAN.md §17.1) fills in "Your videos" and
  // "Comments" — both wired below. Offline/downloads (M2 chunk 4) fills
  // in "Downloads", pointing at the on-device library screen.
  { key: "your-videos", label: "Your videos", glyph: "🎬", href: "/you/videos" },
  { key: "studio-comments", label: "Comments", glyph: "💬", href: "/you/comments" },
  // M4 chunk 3 (PLAN.md §17.1 "Live"): stream key/RTMP URL, start/end,
  // slow mode — not an in-app camera broadcaster, see `you/live.tsx`'s
  // own doc comment for why.
  { key: "go-live", label: "Go live", glyph: "🔴", href: "/you/live" },
  { key: "downloads", label: "Downloads", glyph: "⬇", href: "/you/downloads" },
  { key: "settings", label: "Settings", glyph: "⚙", href: "/settings" },
];

/**
 * You tab (PLAN.md §17.1): signed-in identity header, then the library's
 * entry points. M0 only needed the identity+logout loop for Gate M-A;
 * M2 chunk 1 fills in the rest of the row list, each pointing at its own
 * route under `src/app/you/*` (file-based, no `(tabs)/_layout.tsx` change
 * needed).
 */
export default function YouScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { user, isAuthenticated, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    // M3 chunk 1: unregister this device's push token *before* `logout()`
    // clears the access token below — `DELETE /me/devices/{id}` requires
    // auth, and a device left registered after sign-out would keep
    // receiving another account's pushes on a shared/reset device.
    // Best-effort by design (see `unregisterPushNotifications`'s doc
    // comment) — never blocks the actual logout.
    await unregisterPushNotifications(client);
    await logout();
    setLoggingOut(false);
    router.replace("/setup/login");
  }

  if (!isAuthenticated || !user) {
    return (
      <Screen centered>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", textAlign: "center" }}>
          Sign in to see your library
        </Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.sm,
            textAlign: "center",
            marginTop: theme.spacing[2],
            marginBottom: theme.spacing[4],
          }}
        >
          History, playlists, and saved videos live here once you're signed in.
        </Text>
        <Button label="Sign in" onPress={() => router.push("/setup/login")} testID="you-sign-in" />
      </Screen>
    );
  }

  const avatarUrl = resolveMediaUrl(client.baseUrl, user.avatar_path);

  return (
    <Screen>
      <View style={[styles.identity, { marginBottom: theme.spacing[4] }]}>
        <Avatar uri={avatarUrl} name={user.display_name ?? "You"} size={56} />
        <View style={{ marginLeft: theme.spacing[3], flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700" }} numberOfLines={1}>
            {user.display_name ?? "You"}
          </Text>
          {user.email ? (
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }} numberOfLines={1}>
              {user.email}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ gap: theme.spacing[1] }}>
        {ROWS.map((row) => (
          <Pressable
            key={row.key}
            onPress={() => row.href && router.push(row.href)}
            disabled={!row.href}
            accessibilityRole="button"
            accessibilityLabel={row.href ? row.label : `${row.label}, coming soon`}
            testID={`you-row-${row.key}`}
            style={({ pressed }) => [
              styles.row,
              {
                paddingVertical: theme.spacing[3],
                opacity: !row.href ? 0.5 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 20, width: 28 }}>{row.glyph}</Text>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, flex: 1, marginLeft: theme.spacing[2] }}>
              {row.label}
            </Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>
              {row.href ? "›" : "Coming soon"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: theme.spacing[6], alignItems: "center" }}>
        <Button
          testID="logout-button"
          label={loggingOut ? "Logging out…" : "Log out"}
          variant="secondary"
          onPress={() => void handleLogout()}
          loading={loggingOut}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: "row",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
});
