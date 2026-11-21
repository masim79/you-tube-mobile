import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { clearAllDownloads, getDownloads, removeDownload, validateDownloads } from "../../downloads/downloadRegistry";
import type { DownloadEntry } from "../../downloads/types";
import { RemoveButton } from "../../ui/RemoveButton";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";
import { formatFileSize, formatRelativeTime } from "../../ui/format";

/**
 * Downloads library (PLAN.md §17.1, M2 chunk 4) — what is actually on this
 * device, from `downloadRegistry.ts`, **not** a translation of any web
 * page (confirmed: the web has no equivalent "My Downloads" screen, this
 * is an inherently local-device concept). Runs the expiry/re-validation
 * pass (§17.1) on every focus-equivalent mount: `validateDownloads()`
 * prunes any entry whose local file no longer exists before this screen
 * ever renders it, so a stale row is never shown as playable.
 */
export default function DownloadsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [entries, setEntries] = useState<DownloadEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const valid = await validateDownloads();
      setEntries(valid);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function removeEntry(videoId: string): Promise<void> {
    try {
      const next = await removeDownload(videoId);
      setEntries(next);
    } catch {
      Alert.alert("Couldn't remove", "Please try again.");
    }
  }

  function confirmClearAll(): void {
    Alert.alert("Remove all downloads?", "This deletes every downloaded video from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove all",
        style: "destructive",
        onPress: async () => {
          try {
            await clearAllDownloads();
            setEntries(await getDownloads());
          } catch {
            Alert.alert("Couldn't remove downloads", "Please try again.");
          }
        },
      },
    ]);
  }

  const totalBytes = entries.reduce((sum, entry) => sum + (entry.sizeBytes || 0), 0);

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
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", flex: 1 }}>
            Downloads
          </Text>
          {entries.length > 0 ? (
            <Pressable onPress={confirmClearAll} accessibilityRole="button" accessibilityLabel="Remove all downloads">
              <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.sm, fontWeight: "600" }}>
                Clear all
              </Text>
            </Pressable>
          ) : null}
        </View>

        {entries.length > 0 ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              marginBottom: theme.spacing[3],
            }}
          >
            {entries.length} download{entries.length === 1 ? "" : "s"} · {formatFileSize(totalBytes)} used
          </Text>
        ) : null}

        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.videoId}
          refreshing={isLoading}
          onRefresh={reload}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing[3] }} />}
          contentContainerStyle={{ paddingBottom: theme.spacing[6] }}
          ListEmptyComponent={
            isLoading ? undefined : (
              <View style={[styles.emptyWrap, { paddingTop: theme.spacing[6] }]}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
                  Videos you download will show up here.
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <DownloadRow entry={item} onPress={() => router.push(`/watch/${item.videoId}`)} onRemove={() => void removeEntry(item.videoId)} />
          )}
        />
      </Screen>
    </>
  );
}

function DownloadRow({ entry, onPress, onRemove }: { entry: DownloadEntry; onPress: () => void; onRemove: () => void }) {
  const theme = useTheme();
  const qualityLabel = entry.quality === "audio" ? "Audio only" : `${entry.quality}p`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.title}
      testID="download-row"
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View
        style={[
          styles.thumbnailWrap,
          { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md },
        ]}
      >
        {entry.localThumbnailPath ? (
          <Image source={{ uri: entry.localThumbnailPath }} style={styles.thumbnail} accessibilityIgnoresInvertColors />
        ) : null}
      </View>
      <View style={[styles.meta, { marginLeft: theme.spacing[3] }]}>
        <Text numberOfLines={2} style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "500" }}>
          {entry.title}
        </Text>
        {entry.channelName ? (
          <Text numberOfLines={1} style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}>
            {entry.channelName}
          </Text>
        ) : null}
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
          {qualityLabel} · {formatFileSize(entry.sizeBytes)} · {formatRelativeTime(new Date(entry.downloadedAt))}
        </Text>
      </View>
      <RemoveButton accessibilityLabel="Delete download" onPress={onRemove} testID="download-remove" />
    </Pressable>
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
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  thumbnailWrap: {
    width: 120,
    height: 68,
    overflow: "hidden",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
});
