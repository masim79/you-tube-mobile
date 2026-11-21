import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { getStudioVideos, type Video, type VideoStatus } from "../../api/videos";
import { useApiClient } from "../../api/useApiClient";
import { useCursorPage, type Page } from "../../api/pagination";
import { Chip } from "../../ui/Chip";
import { formatCompactNumber, resolveMediaUrl } from "../../ui/format";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";

type StatusFilter = VideoStatus | "all";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "uploading", label: "Uploading" },
  { value: "processing", label: "Processing" },
  { value: "ready", label: "Ready" },
  { value: "failed", label: "Failed" },
];

const PENDING_STATUSES: VideoStatus[] = ["uploading", "processing"];
const POLL_INTERVAL_MS = 5000;

function statusLabel(status: VideoStatus | undefined): string {
  return STATUS_FILTERS.find((option) => option.value === status)?.label ?? status ?? "Unknown";
}

/**
 * "Your videos" (PLAN.md §17.1 Studio-lite, M2 chunk 3): the owner's own
 * video list, any status/visibility — mirrors the web's
 * `studio/content/content-page.ts` server-side status filter
 * (`GET /studio/videos?status=`), translated to a single-column list with
 * a custom row rather than `VideoCard`/`VideoList`: those are built around
 * a channel avatar/name block that's redundant here (every row is the
 * caller's own channel) and have no status-badge slot, so a dedicated row
 * reads more cleanly than bolting a badge prop onto the shared card.
 *
 * No search box (the web's `q` filter) and no visibility filter chips —
 * Studio-lite is deliberately the light subset (§17.1: "not a replacement
 * for the web app"); status is the filter that matters most for "did my
 * upload finish" at a glance, which is also why pending rows are polled
 * (whole-list refresh) the same way the web's content page is.
 */
export default function YourVideosScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<Video>> =>
      getStudioVideos(client, {
        status: statusFilter === "all" ? undefined : statusFilter,
        cursor,
        limit: 24,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, statusFilter]
  );

  const { items, isLoading, isLoadingMore, error, reload, loadMore, hasMore } = useCursorPage<Video>(fetchPage);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Polls the whole list while anything is still uploading/processing, so
  // a just-finished encode's status flips without the user pulling to
  // refresh — same idea as the web's content-page.ts poll.
  useEffect(() => {
    const interval = setInterval(() => {
      if (itemsRef.current.some((video) => PENDING_STATUSES.includes(video.status ?? "ready"))) {
        void reload();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            Your videos
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2], marginBottom: theme.spacing[3] }}>
          {STATUS_FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={statusFilter === option.value}
              onPress={() => setStatusFilter(option.value)}
              testID={`your-videos-filter-${option.value}`}
            />
          ))}
        </View>

        {isLoading && items.length === 0 ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>Loading…</Text>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: "center" }}>
              {error ? error.message : "You haven't uploaded any videos yet."}
            </Text>
          </View>
        ) : (
          <FlatList
            testID="your-videos-list"
            data={items}
            keyExtractor={(item, index) => item.id ?? String(index)}
            onEndReachedThreshold={0.5}
            onEndReached={() => hasMore && loadMore()}
            refreshing={isLoading}
            onRefresh={reload}
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing[2] }} />}
            ListFooterComponent={
              isLoadingMore ? (
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.sm,
                    textAlign: "center",
                    marginTop: theme.spacing[3],
                  }}
                >
                  Loading more…
                </Text>
              ) : undefined
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => item.id && router.push(`/you/videos/${item.id}/edit`)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title ?? "Video"}, ${statusLabel(item.status)}`}
                testID="your-video-row"
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing[3],
                  },
                ]}
              >
                <View
                  style={[
                    styles.thumbnailWrap,
                    { backgroundColor: theme.colors.surface, borderRadius: theme.radius.sm },
                  ]}
                >
                  {resolveMediaUrl(client.baseUrl, item.thumbnail_path) ? (
                    <Image
                      source={{ uri: resolveMediaUrl(client.baseUrl, item.thumbnail_path)! }}
                      style={styles.thumbnail}
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, marginLeft: theme.spacing[3] }}>
                  <Text
                    style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}
                    numberOfLines={2}
                  >
                    {item.title || "(untitled)"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: theme.spacing[1], gap: theme.spacing[2] }}>
                    <Text
                      style={{
                        color: PENDING_STATUSES.includes(item.status ?? "ready")
                          ? theme.colors.accent
                          : item.status === "failed"
                            ? theme.colors.accent
                            : theme.colors.textSecondary,
                        fontSize: theme.fontSize.xs,
                        fontWeight: "700",
                      }}
                    >
                      {statusLabel(item.status).toUpperCase()}
                    </Text>
                    <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>
                      · {item.visibility ?? "private"}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
                    {formatCompactNumber(item.view_count ?? 0)} views · {formatCompactNumber(item.comment_count ?? 0)} comments
                  </Text>
                </View>
                <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.md }}>›</Text>
              </Pressable>
            )}
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
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  thumbnailWrap: {
    width: 96,
    aspectRatio: 16 / 9,
    overflow: "hidden",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
});
