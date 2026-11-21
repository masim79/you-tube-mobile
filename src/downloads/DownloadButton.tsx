import { NetworkStateType, useNetworkState } from "expo-network";
import React, { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { Video } from "../api/videos";
import { useApiClient } from "../api/useApiClient";
import { Pill } from "../engagement/ActionPills";
import { useSettings } from "../store/SettingsContext";
import { useTheme } from "../theme/ThemeProvider";
import { formatFileSize } from "../ui/format";
import { clearDownloadProgress, getDownloadOptions, startDownload, type DownloadOptions } from "./downloadManager";
import { useDownloadProgress } from "./downloadProgressStore";
import { getDownloadForVideo } from "./downloadRegistry";

/** Above this, a cellular download gets a confirmation prompt even with Data Saver off and Wi-Fi-only off — §17.1's "warn before a large download over cellular". */
const LARGE_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export interface DownloadButtonProps {
  video: Video;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
}

/**
 * The Watch screen's Download entry point (PLAN.md §17.1, M2 chunk 4) —
 * rendered as one more pill in `ActionPills`' row, next to Like/Share/Save,
 * matching YouTube's own placement. Opens a quality picker sourced from
 * `getDownloadOptions`, warns/blocks per Data Saver and the
 * download-over-Wi-Fi-only setting, then hands off to
 * `downloadManager.startDownload`. Progress while in flight comes from
 * `useDownloadProgress` (module-level pub/sub, not a prop) so this stays
 * a self-contained drop-in rather than needing `ActionPills`/the Watch
 * screen to thread download state through.
 */
export function DownloadButton({ video, isAuthenticated, onRequireAuth }: DownloadButtonProps) {
  const theme = useTheme();
  const client = useApiClient();
  const settings = useSettings();
  const networkState = useNetworkState();
  const videoId = video.id ?? null;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [options, setOptions] = useState<DownloadOptions | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);

  const progress = useDownloadProgress(videoId);
  const isBusy = progress?.phase === "requesting" || progress?.phase === "preparing" || progress?.phase === "downloading";

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    void getDownloadForVideo(videoId).then((entry) => {
      if (!cancelled) setIsDownloaded(!!entry);
    });
    return () => {
      cancelled = true;
    };
    // Re-checked whenever a download for this video finishes, so the pill
    // flips from "Downloading…" to "Downloaded" without needing a manual
    // screen refresh.
  }, [videoId, progress?.phase]);

  async function openPicker(): Promise<void> {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (!videoId || isBusy) return;
    setSheetOpen(true);
    setLoadingOptions(true);
    try {
      const result = await getDownloadOptions(client, videoId);
      setOptions(result);
    } catch {
      setOptions({ allowed: false, reason: null, qualities: [] });
    } finally {
      setLoadingOptions(false);
    }
  }

  function closePicker(): void {
    setSheetOpen(false);
  }

  function onPickQuality(quality: string, estimatedBytes: number | undefined): void {
    closePicker();
    const isCellular = networkState.type === NetworkStateType.CELLULAR;

    if (isCellular && settings.downloadOverWifiOnly) {
      Alert.alert(
        "Wi-Fi only",
        "Downloads are set to Wi-Fi only. Turn this off in Settings to download over cellular.",
        [{ text: "OK" }]
      );
      return;
    }

    const isLarge = (estimatedBytes ?? 0) > LARGE_DOWNLOAD_BYTES;
    if (isCellular && (settings.dataSaver || isLarge)) {
      Alert.alert(
        "Download over cellular?",
        `This download is about ${formatFileSize(estimatedBytes ?? 0)}. Continue using cellular data?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Download", onPress: () => void runDownload(quality) },
        ]
      );
      return;
    }

    void runDownload(quality);
  }

  async function runDownload(quality: string): Promise<void> {
    if (!videoId) return;
    try {
      await startDownload({ client, video, quality });
      setIsDownloaded(true);
    } catch {
      Alert.alert("Download failed", "Please try again.");
    } finally {
      // Let the pill show the terminal state for this render cycle, then
      // drop it so a future re-download of this same video starts clean.
      setTimeout(() => clearDownloadProgress(videoId), 3000);
    }
  }

  const label = isBusy
    ? progress?.phase === "preparing"
      ? "Preparing…"
      : progress?.phase === "requesting"
        ? "Starting…"
        : `${Math.round((progress?.progress ?? 0) * 100)}%`
    : progress?.phase === "error"
      ? "Retry"
      : isDownloaded
        ? "Downloaded"
        : "Download";

  return (
    <>
      <Pill
        label={label}
        icon={isBusy ? "⬇" : progress?.phase === "error" ? "⚠" : isDownloaded ? "✓" : "⬇"}
        onPress={() => void openPicker()}
        testID="action-download"
        selected={isDownloaded && !isBusy}
      />

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={closePicker}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: `${theme.colors.bg}99` }]}
          onPress={closePicker}
          accessibilityLabel="Close quality picker"
        >
          <View style={[styles.sheet, { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md }]}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.xs,
                fontWeight: "600",
                padding: theme.spacing[3],
              }}
            >
              DOWNLOAD QUALITY
            </Text>

            {loadingOptions ? (
              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, padding: theme.spacing[4] }}>
                Loading…
              </Text>
            ) : !options?.allowed ? (
              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, padding: theme.spacing[4] }}>
                {options?.reason === "owner_disabled"
                  ? "The creator has turned off downloads for this video."
                  : "Downloads are turned off on this server."}
              </Text>
            ) : (options?.qualities ?? []).length === 0 ? (
              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, padding: theme.spacing[4] }}>
                No downloadable renditions are available for this video.
              </Text>
            ) : (
              (options?.qualities ?? []).map((item) => (
                <Pressable
                  key={item.quality ?? ""}
                  onPress={() => item.quality && onPickQuality(item.quality, item.estimated_bytes)}
                  style={[styles.row, { paddingHorizontal: theme.spacing[4], paddingVertical: theme.spacing[3] }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.quality}${item.estimated_bytes ? `, about ${formatFileSize(item.estimated_bytes)}` : ""}`}
                  testID={`download-quality-${item.quality}`}
                >
                  <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>
                    {item.quality === "audio" ? "Audio only" : `${item.quality}p`}
                  </Text>
                  {item.estimated_bytes ? (
                    <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
                      {formatFileSize(item.estimated_bytes)}
                    </Text>
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
