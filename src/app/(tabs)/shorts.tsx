import { useNavigation, useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCursorPage, type Page } from "../../api/pagination";
import { getShortsFeed } from "../../api/shorts";
import { useApiClient } from "../../api/useApiClient";
import type { Video } from "../../api/videos";
import { PLAYER_CHROME } from "../../player/playerChrome";
import { ShortsFeedItem } from "../../shorts/ShortsFeedItem";
import { ShortsPager } from "../../shorts/ShortsPager";
import { useAuth } from "../../store/AuthContext";

/**
 * `/shorts` tab (PLAN.md §17.1's "Shorts" row, M4 chunk 1): a vertical,
 * full-screen swipe feed over `GET /feed/shorts` (R4-P4 backend,
 * `src/api/shorts.ts`), paged with the same `useCursorPage` helper every
 * other feed in this app uses — only the *rendering* is Shorts-specific
 * (`ShortsPager`/`ShortsFeedItem`), not a second pagination mechanism.
 *
 * The tab bar is hidden while this screen is focused (and restored on
 * blur/unmount) — an immersive, edge-to-edge vertical feed is the point of
 * Shorts, and the YouTube app itself hides its own bottom bar here. Done
 * via the parent `Tabs` navigator's own `tabBarStyle` option rather than
 * anything in `ShortsPager`, which has no opinion about what's rendered
 * around it.
 */
export default function ShortsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const client = useApiClient();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: "none" } });
    return () => {
      parent?.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation]);

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<Video>> => getShortsFeed(client, { cursor, limit: 10 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request]
  );

  const { items, isLoading, error, reload, loadMore } = useCursorPage<Video>(fetchPage);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requireAuth(): void {
    router.push("/setup/login");
  }

  function pressChannel(handle: string): void {
    router.push(`/channel/${handle}`);
  }

  return (
    <View style={styles.fill}>
      {isLoading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={PLAYER_CHROME.text} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.message}>{error ? "Couldn't load Shorts." : "No Shorts yet."}</Text>
        </View>
      ) : (
        <ShortsPager
          items={items}
          keyExtractor={(video, index) => video.id ?? String(index)}
          onNearEnd={() => void loadMore()}
          renderItem={(video, _index, isActive) => (
            <ShortsFeedItem
              video={video}
              isActive={isActive}
              isAuthenticated={isAuthenticated}
              onRequireAuth={requireAuth}
              onPressChannel={pressChannel}
            />
          )}
        />
      )}

      {/* PLAN.md §17.1 "Shorts creation" entry point — lives on the Shorts
          tab itself (mirrors the YouTube app's own Shorts-tab "+"), distinct
          from the generic `/create` tab's own button, which still exists
          for ordinary uploads. Deep-links into that same screen with
          `isShort=1` rather than forking the upload/record machinery — see
          `(tabs)/create.tsx`'s own doc comment. */}
      <Pressable
        onPress={() => router.push({ pathname: "/create", params: { isShort: "1" } })}
        accessibilityRole="button"
        accessibilityLabel="Create a Short"
        testID="shorts-create-button"
        style={[styles.createButton, { top: insets.top + 12 }]}
      >
        <Text style={styles.createButtonText}>+ Short</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: PLAYER_CHROME.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: PLAYER_CHROME.text,
    fontSize: 15,
  },
  createButton: {
    position: "absolute",
    right: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: `${PLAYER_CHROME.background}99`,
    borderWidth: 1,
    borderColor: PLAYER_CHROME.text,
  },
  createButtonText: {
    color: PLAYER_CHROME.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
