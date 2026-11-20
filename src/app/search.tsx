import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";

import { useApiClient } from "../api/useApiClient";
import { search as searchVideos } from "../api/search";
import { useCursorPage, type Page } from "../api/pagination";
import type { Video } from "../api/videos";
import * as recentSearches from "../store/recentSearches";
import { Screen } from "../ui/Screen";
import { useTheme } from "../theme/ThemeProvider";
import { VideoList } from "../ui/VideoList";
import { VoiceSearchButton } from "../ui/VoiceSearchButton";

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

/**
 * Full-screen search (PLAN.md §17.1 M1 row): full-text search,
 * search-as-you-type as the honest substitute for a suggestions endpoint
 * (none exists in `contracts/openapi.yaml` — checked before writing
 * this), recent searches persisted locally, and a mic button that's
 * clearly labelled unavailable rather than half-wired (see
 * `VoiceSearchButton`).
 *
 * Reached from Home's header search icon (`router.push("/search")`)
 * rather than a sixth tab — the tab bar is fixed at five destinations
 * per §17.1, same pattern the YouTube app itself uses.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    void recentSearches.getRecentSearches().then(setRecent);
    // Autofocus the search field on open, matching the YouTube app's own
    // "search opens straight into the keyboard" behaviour.
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(focusTimer);
  }, []);

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<Video>> => searchVideos(client, { q: submittedQuery, cursor, limit: 24 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, submittedQuery]
  );

  const { items, isLoading, isLoadingMore, error, reload, loadMore } = useCursorPage<Video>(fetchPage);

  useEffect(() => {
    if (submittedQuery.trim().length >= MIN_QUERY_LENGTH) {
      void reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery]);

  // Debounced search-as-you-type — the fallback for a missing
  // suggestions/autocomplete endpoint (PLAN.md's instruction: don't
  // invent a fake one).
  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSubmittedQuery(text);
    }, DEBOUNCE_MS);
  };

  const commitSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    if (trimmed.length >= MIN_QUERY_LENGTH) {
      const updated = await recentSearches.addRecentSearch(trimmed);
      setRecent(updated);
    }
  }, []);

  const onSelectRecent = (term: string) => {
    void commitSearch(term);
  };

  const onRemoveRecent = async (term: string) => {
    const updated = await recentSearches.removeRecentSearch(term);
    setRecent(updated);
  };

  const showRecent = submittedQuery.trim().length < MIN_QUERY_LENGTH;

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen>
        <View style={[styles.header, { marginBottom: theme.spacing[3] }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close search"
            hitSlop={8}
            style={styles.iconButton}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20 }}>←</Text>
          </Pressable>
          <View
            style={[
              styles.inputWrap,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.pill,
                marginHorizontal: theme.spacing[2],
                paddingHorizontal: theme.spacing[4],
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={onChangeQuery}
              onSubmitEditing={() => commitSearch(query)}
              placeholder="Search HomeTube"
              placeholderTextColor={theme.colors.textSecondary}
              returnKeyType="search"
              accessibilityLabel="Search HomeTube"
              style={{ color: theme.colors.text, fontFamily: theme.fontFamily, fontSize: theme.fontSize.md, flex: 1 }}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => onChangeQuery("")}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
              >
                <Text style={{ color: theme.colors.textSecondary, fontSize: 16 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          <VoiceSearchButton />
        </View>

        {showRecent ? (
          <RecentSearches recent={recent} onSelect={onSelectRecent} onRemove={onRemoveRecent} />
        ) : (
          <VideoList
            testID="search-results"
            items={items}
            baseUrl={client.baseUrl}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            error={error}
            onLoadMore={loadMore}
            onRefresh={reload}
            onPressVideo={(video) => video.id && router.push(`/watch/${video.id}`)}
            onPressChannel={(handle) => router.push(`/channel/${handle}`)}
            emptyLabel={`No results for "${submittedQuery}".`}
          />
        )}
      </Screen>
    </>
  );
}

function RecentSearches({
  recent,
  onSelect,
  onRemove,
}: {
  recent: string[];
  onSelect: (term: string) => void;
  onRemove: (term: string) => void;
}) {
  const theme = useTheme();

  if (recent.length === 0) {
    return (
      <View style={[styles.emptyRecent, { paddingTop: theme.spacing[6] }]}>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
          Search for videos and channels.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex}>
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontSize: theme.fontSize.sm,
          marginBottom: theme.spacing[2],
          fontWeight: "600",
        }}
      >
        Recent searches
      </Text>
      {recent.map((term) => (
        <View
          key={term}
          style={[styles.recentRow, { paddingVertical: theme.spacing[2] }]}
        >
          <Pressable
            style={styles.recentLabel}
            onPress={() => onSelect(term)}
            accessibilityRole="button"
            accessibilityLabel={`Search for ${term}`}
          >
            <Text style={{ color: theme.colors.textSecondary, marginRight: theme.spacing[2] }}>🕐</Text>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>{term}</Text>
          </Pressable>
          <Pressable
            onPress={() => onRemove(term)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${term} from recent searches`}
            hitSlop={8}
          >
            <Text style={{ color: theme.colors.textSecondary, fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
  },
  emptyRecent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentLabel: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
});
