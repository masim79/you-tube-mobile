import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../../api/useApiClient";
import {
  deletePlaylist,
  getPlaylist,
  getPlaylistItems,
  removePlaylistItem,
  updatePlaylist,
  type Playlist,
  type PlaylistItem,
  type Visibility,
} from "../../../api/playlists";
import { useCursorPage, type Page } from "../../../api/pagination";
import type { Video } from "../../../api/videos";
import { BottomSheet } from "../../../ui/BottomSheet";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { LoadingState } from "../../../ui/LoadingState";
import { RemoveButton } from "../../../ui/RemoveButton";
import { Screen } from "../../../ui/Screen";
import { TextField } from "../../../ui/TextField";
import { useTheme } from "../../../theme/ThemeProvider";
import { VideoList } from "../../../ui/VideoList";

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
];

/**
 * Playlist detail (PLAN.md §17.1's You-tab row) — reached only from the
 * Playlists screen, which lists the caller's own playlists, so every
 * playlist landed on here is already owned by the caller: rename/delete
 * and per-item removal are shown unconditionally rather than re-deriving
 * ownership from `Playlist` (which carries `channel_id`, not an
 * `is_owner` flag).
 */
export default function PlaylistDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loadingPlaylist, setLoadingPlaylist] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editVisibility, setEditVisibility] = useState<Visibility>("private");
  const [saving, setSaving] = useState(false);

  const loadPlaylist = useCallback(async () => {
    if (!id) return;
    setLoadingPlaylist(true);
    try {
      const result = await getPlaylist(client, id);
      setPlaylist(result);
    } catch {
      setPlaylist(null);
    } finally {
      setLoadingPlaylist(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request, id]);

  useEffect(() => {
    void loadPlaylist();
  }, [loadPlaylist]);

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<PlaylistItem>> =>
      id ? getPlaylistItems(client, id, { cursor, limit: 24 }) : Promise.resolve({ items: [], next_cursor: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, id]
  );

  const { items, isLoading, isLoadingMore, error, reload, loadMore, removeItem } = useCursorPage<PlaylistItem>(
    fetchPage
  );

  useEffect(() => {
    if (id) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // See you/history.tsx's comment on why this is filtered once and indexed
  // consistently rather than two independent `.filter()` calls.
  const validItems = items.filter((item) => item.video);
  const videos: Video[] = validItems.map((item) => item.video!);

  function openEditor() {
    if (!playlist) return;
    setEditTitle(playlist.title ?? "");
    setEditVisibility((playlist.visibility ?? "private") as Visibility);
    setEditorOpen(true);
  }

  async function submitEdit() {
    if (!id) return;
    const title = editTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      const updated = await updatePlaylist(client, id, { title, visibility: editVisibility });
      setPlaylist(updated);
      setEditorOpen(false);
    } catch {
      Alert.alert("Couldn't save changes", "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert("Delete this playlist?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePlaylist(client, id);
            router.back();
          } catch {
            Alert.alert("Couldn't delete playlist", "Please try again.");
          }
        },
      },
    ]);
  }

  async function removeVideo(itemId: string | undefined) {
    if (!id || !itemId) return;
    try {
      await removePlaylistItem(client, id, itemId);
      removeItem((item) => item.id === itemId);
      setPlaylist((prev) => (prev ? { ...prev, item_count: Math.max(0, (prev.item_count ?? 1) - 1) } : prev));
    } catch {
      Alert.alert("Couldn't remove", "Please try again.");
    }
  }

  if (loadingPlaylist) {
    return <LoadingState label="Loading playlist…" />;
  }

  if (!playlist) {
    return (
      <Screen centered>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
          This playlist couldn't be loaded.
        </Text>
        <View style={{ marginTop: theme.spacing[4] }}>
          <Button label="Go back" onPress={() => router.back()} variant="secondary" />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen>
        <View style={[styles.header, { marginBottom: theme.spacing[1] }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/you/playlists"))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.iconButton}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20 }}>←</Text>
          </Pressable>
          <Text
            style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", flex: 1 }}
            numberOfLines={1}
          >
            {playlist.title}
          </Text>
          <Pressable onPress={openEditor} accessibilityRole="button" accessibilityLabel="Rename playlist">
            <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.sm, fontWeight: "600" }}>Edit</Text>
          </Pressable>
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete playlist"
            style={{ marginLeft: theme.spacing[3] }}
          >
            <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.sm, fontWeight: "600" }}>Delete</Text>
          </Pressable>
        </View>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            marginBottom: theme.spacing[3],
          }}
        >
          {playlist.item_count ?? 0} {playlist.item_count === 1 ? "video" : "videos"} · {playlist.visibility}
        </Text>

        <VideoList
          testID="playlist-items-list"
          items={videos}
          baseUrl={client.baseUrl}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          error={error}
          onLoadMore={loadMore}
          onRefresh={reload}
          onPressVideo={(video) => video.id && router.push(`/watch/${video.id}`)}
          onPressChannel={(handle) => router.push(`/channel/${handle}`)}
          emptyLabel="No videos in this playlist yet."
          keyExtractor={(_video, index) => validItems[index]?.id ?? String(index)}
          trailingAction={(_video, index) => (
            <RemoveButton
              accessibilityLabel="Remove from playlist"
              onPress={() => void removeVideo(validItems[index]?.id)}
            />
          )}
        />
      </Screen>

      <BottomSheet visible={editorOpen} onClose={() => setEditorOpen(false)} title="Edit playlist" testID="edit-playlist-sheet">
        <View style={{ paddingHorizontal: theme.spacing[4], gap: theme.spacing[3] }}>
          <TextField label="Title" value={editTitle} onChangeText={setEditTitle} maxLength={150} />
          <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
            {VISIBILITIES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={editVisibility === option.value}
                onPress={() => setEditVisibility(option.value)}
              />
            ))}
          </View>
          <Button
            label={saving ? "Saving…" : "Save"}
            onPress={() => void submitEdit()}
            disabled={!editTitle.trim() || saving}
            loading={saving}
            testID="edit-playlist-submit"
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
});
