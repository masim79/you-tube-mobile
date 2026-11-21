import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { Video } from "../api/videos";
import { useApiClient } from "../api/useApiClient";
import { DownloadButton } from "../downloads/DownloadButton";
import { shareVideo } from "./shareVideo";
import { useSavedState } from "./useSavedState";
import { useVideoReaction } from "./useVideoReaction";
import { formatCompactNumber } from "../ui/format";
import { useTheme } from "../theme/ThemeProvider";

export interface ActionPillsProps {
  video: Video;
  commentCount: number;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onOpenComments: () => void;
}

/**
 * The pill row under the channel row (PLAN.md §17.1 "Watch"): Like/Dislike,
 * Share, Save, Comments. Mirrors the web's `action-pills.ts` for the
 * like/dislike optimistic-update-with-silent-rollback pattern (§20.1: the
 * reaction endpoint is idempotent, so a failed request just reverts the
 * local counts rather than surfacing an error) — translated to a
 * horizontally scrollable row of pills since a phone screen is narrower
 * than the pills would need.
 *
 * Give this component a `key={video.id}` at the call site — its optimistic
 * state is seeded once from the `video` prop and is not re-synced if the
 * same component instance is handed a different video (matches
 * `VideoPlayer`'s own `key={video.id}` convention in the watch screen).
 */
export function ActionPills({ video, commentCount, isAuthenticated, onRequireAuth, onOpenComments }: ActionPillsProps) {
  const theme = useTheme();
  const client = useApiClient();

  const { likeCount, dislikeCount, yourReaction, react } = useVideoReaction(video, isAuthenticated, onRequireAuth);
  const { isSaved, toggleSave } = useSavedState(video.id, isAuthenticated, onRequireAuth);

  function share(): Promise<void> {
    return shareVideo(client, video.id);
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={{ marginTop: theme.spacing[3] }}
    >
      <View
        style={[
          styles.pillGroup,
          { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.pill },
        ]}
      >
        <Pressable
          onPress={() => void react(1)}
          accessibilityRole="button"
          accessibilityLabel={`Like, ${formatCompactNumber(likeCount)}`}
          accessibilityState={{ selected: yourReaction === 1 }}
          testID="action-like"
          style={[
            styles.pillHalf,
            { paddingHorizontal: theme.spacing[3], backgroundColor: yourReaction === 1 ? theme.colors.surfaceHover : "transparent" },
          ]}
        >
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>👍</Text>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, marginLeft: theme.spacing[1] }}>
            {formatCompactNumber(likeCount)}
          </Text>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        <Pressable
          onPress={() => void react(-1)}
          accessibilityRole="button"
          accessibilityLabel="Dislike"
          accessibilityState={{ selected: yourReaction === -1 }}
          testID="action-dislike"
          style={[
            styles.pillHalf,
            { paddingHorizontal: theme.spacing[3], backgroundColor: yourReaction === -1 ? theme.colors.surfaceHover : "transparent" },
          ]}
        >
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>👎</Text>
        </Pressable>
      </View>

      <Pill
        label="Share"
        icon="↗"
        onPress={() => void share()}
        testID="action-share"
      />
      <Pill
        label={isSaved ? "Saved" : "Save"}
        icon={isSaved ? "✓" : "＋"}
        onPress={() => void toggleSave()}
        testID="action-save"
        selected={isSaved}
      />
      <Pill
        label={formatCompactNumber(commentCount)}
        icon="💬"
        onPress={onOpenComments}
        testID="action-comments"
      />

      {/* Offline downloads (M2 chunk 4, PLAN.md §17.1) — placed last in the
          row, matching the YouTube app's own Download entry point sitting
          after the engagement actions. Self-contained: owns its own
          quality-picker sheet and progress state, so this call site is the
          entire integration. */}
      <DownloadButton video={video} isAuthenticated={isAuthenticated} onRequireAuth={onRequireAuth} />
    </ScrollView>
  );
}

export function Pill({
  label,
  icon,
  onPress,
  testID,
  selected = false,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  testID?: string;
  selected?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? theme.colors.surfaceHover : theme.colors.surfaceRaised,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing[3],
          marginLeft: theme.spacing[2],
        },
      ]}
    >
      <Text style={{ fontSize: theme.fontSize.md }}>{icon}</Text>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, marginLeft: theme.spacing[1] }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
  },
  pillGroup: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    height: 40,
  },
  pillHalf: {
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
  },
  divider: {
    width: 1,
    height: 20,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
  },
});
