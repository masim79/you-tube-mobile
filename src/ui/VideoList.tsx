import React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from "react-native";

import type { Video } from "../api/videos";
import { Button } from "./Button";
import { useTheme } from "../theme/ThemeProvider";
import { VideoCard } from "./VideoCard";
import { VideoCardSkeleton } from "./VideoCardSkeleton";

export interface VideoListProps {
  items: Video[];
  baseUrl: string | null;
  /** True only for a first/replacing load — same meaning as `useCursorPage`'s `isLoading`. */
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  onLoadMore: () => void;
  onRefresh: () => void;
  onPressVideo: (video: Video) => void;
  onPressChannel?: (handle: string) => void;
  /** Shown above the list once content is ready — the chip bar on Home, nothing on Search. */
  header?: React.ReactNode;
  emptyLabel?: string;
  testID?: string;
}

/**
 * The shared "load a page of videos into a vertical scroller" list used
 * by Home and Search alike (PLAN.md's instruction to extend `ui/` with a
 * `VideoGrid`-equivalent rather than one-off screen styles — a phone feed
 * is a single column, so this is a list, not the web's grid). Skeleton
 * grid on first load, a smaller skeleton batch while loading more, pull
 * to refresh via the standard `RefreshControl`, matching §10.3's "never
 * spinners on the grid" and the home/search pages' own infinite-scroll
 * pattern (`vendor/you-tube/frontend/src/app/pages/home/home-page.ts`).
 */
export function VideoList({
  items,
  baseUrl,
  isLoading,
  isLoadingMore,
  error,
  onLoadMore,
  onRefresh,
  onPressVideo,
  onPressChannel,
  header,
  emptyLabel = "No videos yet.",
  testID,
}: VideoListProps) {
  const theme = useTheme();

  const renderItem: ListRenderItem<Video> = ({ item }) => (
    <VideoCard video={item} baseUrl={baseUrl} onPress={onPressVideo} onPressChannel={onPressChannel} />
  );

  // First paint (or a sort/query change that wiped the list): full
  // skeleton batch, no FlatList yet — §10.3's rule applies to the very
  // first paint too, not just loadMore.
  if (isLoading && items.length === 0) {
    return (
      <View style={styles.flex} testID={testID}>
        {header}
        {Array.from({ length: 6 }).map((_, index) => (
          <View key={index} style={{ marginBottom: theme.spacing[4] }}>
            <VideoCardSkeleton />
          </View>
        ))}
      </View>
    );
  }

  if (!isLoading && items.length === 0) {
    return (
      <View style={styles.flex} testID={testID}>
        {header}
        <View style={[styles.emptyWrap, { paddingTop: theme.spacing[6] }]}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
            {error ? error.message : emptyLabel}
          </Text>
          {error ? (
            <View style={{ marginTop: theme.spacing[4] }}>
              <Button label="Retry" onPress={onRefresh} variant="secondary" />
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <FlatList
      testID={testID}
      style={styles.flex}
      data={items}
      keyExtractor={(item, index) => item.id ?? String(index)}
      renderItem={renderItem}
      ListHeaderComponent={header ? <>{header}</> : undefined}
      ItemSeparatorComponent={() => <View style={{ height: theme.spacing[4] }} />}
      contentContainerStyle={{ paddingBottom: theme.spacing[6] }}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      onEndReachedThreshold={0.5}
      onEndReached={onLoadMore}
      ListFooterComponent={
        isLoadingMore ? (
          <View style={{ marginTop: theme.spacing[4], gap: theme.spacing[4] }}>
            <VideoCardSkeleton />
            <VideoCardSkeleton />
          </View>
        ) : error ? (
          <View style={{ marginTop: theme.spacing[4], alignItems: "center" }}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>{error.message}</Text>
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
