import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../api/useApiClient";
import { createPlaylist, getPlaylists, type Playlist, type Visibility } from "../../api/playlists";
import { useCursorPage, type Page } from "../../api/pagination";
import { BottomSheet } from "../../ui/BottomSheet";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Screen } from "../../ui/Screen";
import { TextField } from "../../ui/TextField";
import { useTheme } from "../../theme/ThemeProvider";

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
];

/**
 * Playlists (PLAN.md §17.1's You-tab row) — the caller's own `normal`-kind
 * playlists only; the system ones (`watch_later`, `liked`) have their own
 * dedicated screens and are filtered out of this list, same as the
 * YouTube app keeps them out of its "Playlists" grid.
 */
export default function PlaylistsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>("private");
  const [creating, setCreating] = useState(false);

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<Playlist>> => getPlaylists(client, { cursor, limit: 50 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request]
  );

  const { items, isLoading, error, reload, loadMore, hasMore } = useCursorPage<Playlist>(fetchPage);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playlists = items.filter((p) => p.kind === "normal");

  async function submitCreate() {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      await createPlaylist(client, { title, visibility: newVisibility });
      setCreatorOpen(false);
      setNewTitle("");
      setNewVisibility("private");
      void reload();
    } catch {
      Alert.alert("Couldn't create playlist", "Please try again.");
    } finally {
      setCreating(false);
    }
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
            Playlists
          </Text>
          <Pressable
            onPress={() => setCreatorOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="New playlist"
          >
            <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.sm, fontWeight: "600" }}>
              New
            </Text>
          </Pressable>
        </View>

        {isLoading && playlists.length === 0 ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>Loading…</Text>
        ) : playlists.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: "center" }}>
              {error ? error.message : "You haven't made any playlists yet."}
            </Text>
          </View>
        ) : (
          <FlatList
            testID="playlists-list"
            data={playlists}
            keyExtractor={(item, index) => item.id ?? String(index)}
            onEndReachedThreshold={0.5}
            onEndReached={() => hasMore && loadMore()}
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing[2] }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => item.id && router.push(`/you/playlist/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={item.title ?? "Playlist"}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing[3],
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}>
                    {item.item_count ?? 0} {item.item_count === 1 ? "video" : "videos"} · {item.visibility}
                  </Text>
                </View>
                <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.md }}>›</Text>
              </Pressable>
            )}
          />
        )}
      </Screen>

      <BottomSheet visible={creatorOpen} onClose={() => setCreatorOpen(false)} title="New playlist" testID="new-playlist-sheet">
        <View style={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[3] }}>
          <TextField
            label="Title"
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Playlist title"
            maxLength={150}
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
            {VISIBILITIES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={newVisibility === option.value}
                onPress={() => setNewVisibility(option.value)}
              />
            ))}
          </View>
          <Button
            label={creating ? "Creating…" : "Create"}
            onPress={() => void submitCreate()}
            disabled={!newTitle.trim() || creating}
            loading={creating}
            testID="create-playlist-submit"
          />
        </View>
      </BottomSheet>
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
});
