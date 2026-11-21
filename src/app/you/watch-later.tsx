import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../api/useApiClient";
import { findSystemPlaylist, getPlaylistItems, type PlaylistItem } from "../../api/playlists";
import { useCursorPage, type Page } from "../../api/pagination";
import { removeFromWatchLater, type Video } from "../../api/videos";
import { LoadingState } from "../../ui/LoadingState";
import { RemoveButton } from "../../ui/RemoveButton";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { VideoList } from "../../ui/VideoList";

/**
 * Watch Later (PLAN.md §17.1's You-tab row) — the list half of the save
 * feature M1 chunk 6 already wired a toggle for on the watch screen
 * (`ActionPills`'s "Save" pill, `addToWatchLater`/`removeFromWatchLater`).
 * This screen only has a playlist *id* to discover first (the system
 * `watch_later` playlist isn't addressable by a fixed id in the contract),
 * then lists its items the same way any playlist's items are listed.
 *
 * Removal here calls `removeFromWatchLater` (the existing convenience
 * endpoint, same one the watch-screen toggle uses) rather than the generic
 * `removePlaylistItem` — chosen for consistency with how an item got added
 * in the first place, and because it only needs a `video_id` the list
 * already has, with no playlist-item-id plumbing.
 */
export default function WatchLaterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();

  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    findSystemPlaylist(client, "watch_later")
      .then((playlist) => {
        if (cancelled) return;
        if (playlist?.id) {
          setPlaylistId(playlist.id);
        } else {
          setResolveError(new Error("Couldn't find your Watch Later list."));
        }
      })
      .catch((cause) => {
        if (!cancelled) setResolveError(cause instanceof Error ? cause : new Error("Couldn't load Watch Later."));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request]);

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<PlaylistItem>> =>
      playlistId ? getPlaylistItems(client, playlistId, { cursor, limit: 24 }) : Promise.resolve({ items: [], next_cursor: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, playlistId]
  );

  const { items, isLoading, isLoadingMore, error, reload, loadMore, removeItem } = useCursorPage<PlaylistItem>(
    fetchPage
  );

  useEffect(() => {
    if (playlistId) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  // See history.tsx's comment on why this is filtered once and indexed
  // consistently rather than two independent `.filter()` calls.
  const validItems = items.filter((item) => item.video);
  const videos: Video[] = validItems.map((item) => item.video!);

  async function removeVideo(videoId: string | undefined, itemId: string | undefined) {
    if (!videoId || !itemId) return;
    try {
      await removeFromWatchLater(client, videoId);
      removeItem((item) => item.id === itemId);
    } catch {
      Alert.alert("Couldn't remove", "Please try again.");
    }
  }

  if (!playlistId && !resolveError) {
    return <LoadingState label="Loading Watch Later…" />;
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
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700" }}>
            Watch Later
          </Text>
        </View>

        <VideoList
          testID="watch-later-list"
          items={videos}
          baseUrl={client.baseUrl}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          error={error ?? resolveError}
          onLoadMore={loadMore}
          onRefresh={reload}
          onPressVideo={(video) => video.id && router.push(`/watch/${video.id}`)}
          onPressChannel={(handle) => router.push(`/channel/${handle}`)}
          emptyLabel="Videos you save to watch later will show up here."
          keyExtractor={(_video, index) => validItems[index]?.id ?? String(index)}
          trailingAction={(_video, index) => (
            <RemoveButton
              accessibilityLabel="Remove from Watch Later"
              onPress={() => void removeVideo(validItems[index]?.video_id, validItems[index]?.id)}
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
