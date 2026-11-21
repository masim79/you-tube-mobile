import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../api/useApiClient";
import { findSystemPlaylist, getPlaylistItems, type PlaylistItem } from "../../api/playlists";
import { useCursorPage, type Page } from "../../api/pagination";
import type { Video } from "../../api/videos";
import { LoadingState } from "../../ui/LoadingState";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { VideoList } from "../../ui/VideoList";

/**
 * Liked videos (PLAN.md §17.1's You-tab row). Per `PlaylistItem`'s contract
 * note, this system playlist's items come from `POST /videos/{id}/reaction`
 * (the existing like/dislike action from M1 chunk 6's `ActionPills`), not
 * `POST /playlists/{id}/items` (a 422 here) — so this list is read-only:
 * no remove button, just a hint pointing back at the video's own like
 * button, same as the YouTube app's own Liked-videos screen.
 */
export default function LikedScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();

  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    findSystemPlaylist(client, "liked")
      .then((playlist) => {
        if (cancelled) return;
        if (playlist?.id) {
          setPlaylistId(playlist.id);
        } else {
          setResolveError(new Error("Couldn't find your Liked videos list."));
        }
      })
      .catch((cause) => {
        if (!cancelled) setResolveError(cause instanceof Error ? cause : new Error("Couldn't load Liked videos."));
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

  const { items, isLoading, isLoadingMore, error, reload, loadMore } = useCursorPage<PlaylistItem>(fetchPage);

  useEffect(() => {
    if (playlistId) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  // See history.tsx's comment on why this is filtered once and indexed
  // consistently rather than two independent `.filter()` calls.
  const validItems = items.filter((item) => item.video);
  const videos: Video[] = validItems.map((item) => item.video!);

  if (!playlistId && !resolveError) {
    return <LoadingState label="Loading Liked videos…" />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen>
        <View style={[styles.header, { marginBottom: theme.spacing[2] }]}>
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
            Liked videos
          </Text>
        </View>
        {videos.length > 0 ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              marginBottom: theme.spacing[3],
            }}
          >
            Unlike a video from its watch screen to remove it here.
          </Text>
        ) : null}

        <VideoList
          testID="liked-list"
          items={videos}
          baseUrl={client.baseUrl}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          error={error ?? resolveError}
          onLoadMore={loadMore}
          onRefresh={reload}
          onPressVideo={(video) => video.id && router.push(`/watch/${video.id}`)}
          onPressChannel={(handle) => router.push(`/channel/${handle}`)}
          emptyLabel="Videos you like will show up here."
          keyExtractor={(_video, index) => validItems[index]?.id ?? String(index)}
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
