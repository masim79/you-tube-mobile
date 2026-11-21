import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { getNotifications, markAllNotificationsRead, markNotificationRead, type Notification } from "../api/notifications";
import { useCursorPage, type Page } from "../api/pagination";
import { useApiClient } from "../api/useApiClient";
import { getNotificationRoute } from "../notifications/deepLink";
import { Button } from "../ui/Button";
import { formatRelativeTime } from "../ui/format";
import { Screen } from "../ui/Screen";
import { useTheme } from "../theme/ThemeProvider";

/** One glyph + a short line of copy per `Notification.type` — no icon component exists for non-video content, so a plain emoji glyph, same convention `(tabs)/you.tsx`'s row list already uses. */
const TYPE_META: Record<string, { glyph: string; label: string }> = {
  video_published: { glyph: "🎬", label: "uploaded a new video" },
  community_post: { glyph: "📝", label: "posted an update" },
  reply: { glyph: "💬", label: "replied to you" },
  mention: { glyph: "📣", label: "mentioned you" },
};

function describe(notification: Notification): { glyph: string; label: string } {
  return TYPE_META[notification.type ?? ""] ?? { glyph: "🔔", label: "sent a notification" };
}

/**
 * In-app notification inbox (M3 chunk 1, PLAN.md §17.1's "in-app inbox"
 * row) — reachable from the bell icon added to `(tabs)/home.tsx`'s header.
 * Keyset-paginated via `GET /me/notifications`, same `useCursorPage`
 * pattern every other list screen in this app already uses (M1/M2).
 *
 * Tap-to-navigate reuses `getNotificationRoute` — the exact mapping the
 * push-tap listener in `PushNotificationsBootstrap` also uses, so there is
 * one definition of "what does this notification open", not two. A
 * `community_post` notification currently has nowhere to go (see that
 * file's doc comment on the contract gap) — tapping one here still marks
 * it read, just doesn't navigate, which is more honest than a dead link.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<Notification>> => getNotifications(client, { cursor, limit: 24 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request]
  );

  const { items, isLoading, isLoadingMore, error, reload, loadMore } = useCursorPage<Notification>(fetchPage);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local-only optimistic read state keyed by id, since `useCursorPage`
  // has no per-item update — only `removeItem` (drop) and full `reload`/
  // `loadMore` (append). Patching `is_read` in place on tap avoids a
  // flicker-inducing reload of the whole list for a one-field change.
  const [readIds, setReadIdsState] = useState<Set<string>>(new Set());

  async function handlePress(notification: Notification) {
    if (notification.id && !readIds.has(notification.id) && !notification.is_read) {
      setReadIdsState((previous) => new Set(previous).add(notification.id!));
      try {
        await markNotificationRead(client, notification.id);
      } catch {
        // Best-effort — leaves it optimistically marked read locally even
        // if the server call failed; the next `reload()` is the source of
        // truth and will correct it either way.
      }
    }
    const route = getNotificationRoute(notification);
    if (route) router.push(route);
  }

  async function handleMarkAllRead() {
    setReadIdsState((previous) => {
      const next = new Set(previous);
      for (const item of items) {
        if (item.id) next.add(item.id);
      }
      return next;
    });
    try {
      await markAllNotificationsRead(client);
    } catch {
      // Best-effort, same reasoning as a single mark-as-read above.
    }
  }

  const hasUnread = items.some((item) => item.id && !readIds.has(item.id) && !item.is_read);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen>
        <View style={[styles.header, { marginBottom: theme.spacing[2] }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.iconButton}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20 }}>←</Text>
          </Pressable>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", flex: 1 }}>
            Notifications
          </Text>
          {hasUnread ? (
            <Pressable
              onPress={() => void handleMarkAllRead()}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
              testID="notifications-mark-all-read"
              hitSlop={8}
              style={styles.iconButton}
            >
              <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.xs, fontWeight: "600" }}>
                Mark all read
              </Text>
            </Pressable>
          ) : null}
        </View>

        {isLoading && items.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : !isLoading && items.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: "center" }}>
              {error ? error.message : "Nothing here yet — uploads, replies and mentions will show up here."}
            </Text>
            {error ? (
              <View style={{ marginTop: theme.spacing[4] }}>
                <Button label="Retry" onPress={reload} variant="secondary" />
              </View>
            ) : null}
          </View>
        ) : (
          <FlatList
            testID="notifications-list"
            data={items}
            keyExtractor={(item, index) => item.id ?? String(index)}
            renderItem={({ item }) => {
              const meta = describe(item);
              const isRead = item.is_read || (item.id ? readIds.has(item.id) : false);
              return (
                <Pressable
                  onPress={() => void handlePress(item)}
                  testID={`notification-row-${item.id}`}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      paddingVertical: theme.spacing[3],
                      backgroundColor: pressed ? theme.colors.surfaceHover : "transparent",
                    },
                  ]}
                >
                  {!isRead ? (
                    <View style={[styles.unreadDot, { backgroundColor: theme.colors.accent }]} />
                  ) : (
                    <View style={styles.unreadDot} />
                  )}
                  <Text style={{ fontSize: 22, width: 32 }}>{meta.glyph}</Text>
                  <View style={{ flex: 1, marginLeft: theme.spacing[2] }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: theme.fontSize.md,
                        fontWeight: isRead ? "400" : "600",
                      }}
                    >
                      {meta.label}
                    </Text>
                    <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 }}>
                      {item.created_at ? formatRelativeTime(new Date(item.created_at)) : ""}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing[1] }} />}
            contentContainerStyle={{ paddingBottom: theme.spacing[6] }}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={reload} tintColor={theme.colors.accent} />}
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            ListFooterComponent={
              isLoadingMore ? (
                <View style={{ marginTop: theme.spacing[4], alignItems: "center" }}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : undefined
            }
          />
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
});
