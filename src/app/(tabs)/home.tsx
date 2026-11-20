import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../api/useApiClient";
import { getHomeFeed, type HomeFeedParams } from "../../api/feed";
import { useCursorPage, type Page } from "../../api/pagination";
import type { Video } from "../../api/videos";
import { Chip } from "../../ui/Chip";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { VideoList } from "../../ui/VideoList";

type Sort = NonNullable<HomeFeedParams["sort"]>;

const SORTS: { value: Sort; label: string }[] = [
  { value: "new", label: "New" },
  { value: "views", label: "Most viewed" },
  // Honest substitute, same reasoning as the web's home page (PLAN.md
  // §17.1/§17.4): no category filter exists on `/feed/home`, so the chip
  // row drives sort axes the API actually supports. `foryou` falls back
  // to `new` server-side for an anonymous caller or a fresh account.
  { value: "foryou", label: "For you" },
];

/** Home feed (PLAN.md §17.1 M1 row): infinite feed, pull to refresh, sort chip bar, skeleton loaders. */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const [sort, setSort] = useState<Sort>("new");

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<Video>> => getHomeFeed(client, { sort, cursor, limit: 24 }),
    // `client.request` (not `client` itself) is the stable part of the
    // client object — `useApiClient()` returns a new object literal every
    // render, which would otherwise defeat this memoization and retrigger
    // the reload-on-sort-change effect below on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, sort]
  );

  const { items, isLoading, isLoadingMore, error, reload, loadMore } = useCursorPage<Video>(fetchPage);

  useEffect(() => {
    void reload();
    // Re-run only when the fetch target actually changes (sort), not on
    // every render — `reload`'s identity already tracks `fetchPage`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  return (
    <Screen>
      <View style={[styles.header, { marginBottom: theme.spacing[3] }]}>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: "700" }}>HomeTube</Text>
        <Pressable
          onPress={() => router.push("/search")}
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={8}
          style={styles.searchButton}
        >
          <Text style={{ color: theme.colors.text, fontSize: 20 }}>🔍</Text>
        </Pressable>
      </View>

      <VideoList
        testID="home-feed"
        items={items}
        baseUrl={client.baseUrl}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        error={error}
        onLoadMore={loadMore}
        onRefresh={reload}
        onPressVideo={(video) => video.id && router.push(`/watch/${video.id}`)}
        onPressChannel={(handle) => router.push(`/channel/${handle}`)}
        emptyLabel="No videos yet."
        header={
          <View style={[styles.chipRow, { marginBottom: theme.spacing[4] }]}>
            {SORTS.map((option) => (
              <View key={option.value} style={{ marginRight: theme.spacing[2] }}>
                <Chip label={option.label} active={sort === option.value} onPress={() => setSort(option.value)} />
              </View>
            ))}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  searchButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
