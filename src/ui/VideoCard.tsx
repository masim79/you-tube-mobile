import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { Video } from "../api/videos";
import { Avatar } from "./Avatar";
import { useTheme } from "../theme/ThemeProvider";
import { formatCompactNumber, formatDuration, formatRelativeTime, resolveMediaUrl } from "./format";

export interface VideoCardProps {
  video: Video;
  baseUrl: string | null;
  onPress: (video: Video) => void;
  onPressChannel?: (handle: string) => void;
}

/**
 * The card used by every vertical list in the app (§10.2 rule 1, mirrored
 * from `vendor/you-tube/frontend/src/app/ui/video-card/` — same shape of
 * props and the same skeleton-variant idea, not copied Angular/template
 * code). A phone feed is one column, so this is full-width thumbnail
 * above a title/channel/meta block, rather than the web's grid card.
 */
export function VideoCard({ video, baseUrl, onPress, onPressChannel }: VideoCardProps) {
  const theme = useTheme();
  const thumbnailUrl = resolveMediaUrl(baseUrl, video.thumbnail_path);
  const avatarUrl = resolveMediaUrl(baseUrl, video.channel_avatar_path);
  const durationLabel = video.duration_s != null ? formatDuration(video.duration_s) : null;
  const watchedPercent =
    video.resume_position_s != null && video.duration_s ? (video.resume_position_s / video.duration_s) * 100 : 0;
  const publishedAt = video.published_at ? new Date(video.published_at) : null;

  return (
    <Pressable
      onPress={() => onPress(video)}
      accessibilityRole="button"
      accessibilityLabel={video.title ?? "Video"}
      style={({ pressed }) => [styles.container, { opacity: pressed ? 0.9 : 1 }]}
      testID="video-card"
    >
      <View
        style={[
          styles.thumbnailWrap,
          { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md },
        ]}
      >
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} accessibilityIgnoresInvertColors />
        ) : null}
        {durationLabel ? (
          <View
            style={[
              styles.durationBadge,
              {
                right: theme.spacing[1],
                bottom: theme.spacing[1],
                paddingHorizontal: theme.spacing[1],
                paddingVertical: theme.spacing[1] / 2,
                backgroundColor: `${theme.colors.bg}cc`,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.xs, fontWeight: "600" }}>
              {durationLabel}
            </Text>
          </View>
        ) : null}
        {watchedPercent > 0 ? (
          <View
            style={[styles.progressTrack, { height: theme.spacing[1], backgroundColor: `${theme.colors.surface}99` }]}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, watchedPercent)}%`, backgroundColor: theme.colors.accent },
              ]}
            />
          </View>
        ) : null}
      </View>

      <View style={[styles.metaRow, { marginTop: theme.spacing[2] }]}>
        <Pressable
          onPress={() => video.channel_handle && onPressChannel?.(video.channel_handle)}
          accessibilityLabel={video.channel_name ?? "Channel"}
          hitSlop={8}
        >
          <Avatar uri={avatarUrl} name={video.channel_name ?? "?"} size={36} />
        </Pressable>
        <View style={[styles.metaText, { marginLeft: theme.spacing[3] }]}>
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.text,
              fontFamily: theme.fontFamily,
              fontSize: theme.fontSize.md,
              fontWeight: "500",
            }}
          >
            {video.title}
          </Text>
          <Text
            style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}
            numberOfLines={1}
          >
            {video.channel_name}
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
            {formatCompactNumber(video.view_count ?? 0)} views
            {publishedAt ? ` · ${formatRelativeTime(publishedAt)}` : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
  },
  thumbnailWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  durationBadge: {
    position: "absolute",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  progressFill: {
    height: "100%",
  },
  metaRow: {
    flexDirection: "row",
  },
  metaText: {
    flex: 1,
    minWidth: 0,
  },
});
