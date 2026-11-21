import { Stack, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../api/useApiClient";
import { clearWatchHistory, deleteWatchHistoryEntry, getWatchHistory, type HistoryEntry } from "../../api/history";
import { useCursorPage, type Page } from "../../api/pagination";
import type { Video } from "../../api/videos";
import { RemoveButton } from "../../ui/RemoveButton";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { VideoList } from "../../ui/VideoList";

/**
 * History (PLAN.md §17.1's You-tab row). `GET /me/history` is newest-first
 * and already embeds each entry's `video`; the thin watch-progress bar
 * under the thumbnail is `VideoCard`'s existing `resume_position_s`
 * rendering (no new UI needed) — `HistoryEntry.watch_progress_s` is used
 * as the authoritative source when `video.resume_position_s` comes back
 * null, since this is specifically a record of what was watched.
 */
export default function HistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<HistoryEntry>> => getWatchHistory(client, { cursor, limit: 24 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request]
  );

  const { items, isLoading, isLoadingMore, error, reload, loadMore, removeItem } = useCursorPage<HistoryEntry>(
    fetchPage
  );

  React.useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered once, then indexed consistently below — `videos[i]` and
  // `validEntries[i]` must stay in lockstep, which a separate `.filter()`
  // per derived array would not guarantee if an entry ever lacked its
  // embedded `video` (e.g. the video was deleted).
  const validEntries = items.filter((entry) => entry.video);
  const videos: Video[] = validEntries.map((entry) => ({
    ...entry.video!,
    resume_position_s: entry.video!.resume_position_s ?? entry.watch_progress_s ?? null,
  }));

  async function removeEntry(entryId: string | undefined) {
    if (!entryId) return;
    try {
      await deleteWatchHistoryEntry(client, entryId);
      removeItem((entry) => entry.id === entryId);
    } catch {
      Alert.alert("Couldn't remove", "Please try again.");
    }
  }

  function confirmClearAll() {
    Alert.alert("Clear all watch history?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear all",
        style: "destructive",
        onPress: async () => {
          try {
            await clearWatchHistory(client);
            void reload();
          } catch {
            Alert.alert("Couldn't clear history", "Please try again.");
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen>
        <View style={[styles.header, { marginBottom: theme.spacing[3] }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/you"))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.iconButton}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20 }}>←</Text>
          </Pressable>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", flex: 1 }}>
            History
          </Text>
          {videos.length > 0 ? (
            <Pressable onPress={confirmClearAll} accessibilityRole="button" accessibilityLabel="Clear all history">
              <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.sm, fontWeight: "600" }}>
                Clear all
              </Text>
            </Pressable>
          ) : null}
        </View>

        <VideoList
          testID="history-list"
          items={videos}
          baseUrl={client.baseUrl}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          error={error}
          onLoadMore={loadMore}
          onRefresh={reload}
          onPressVideo={(video) => video.id && router.push(`/watch/${video.id}`)}
          onPressChannel={(handle) => router.push(`/channel/${handle}`)}
          emptyLabel="Videos you watch will show up here."
          keyExtractor={(_video, index) => validEntries[index]?.id ?? String(index)}
          trailingAction={(_video, index) => (
            <RemoveButton
              accessibilityLabel="Remove from history"
              onPress={() => void removeEntry(validEntries[index]?.id)}
            />
          )}
        />
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
});
