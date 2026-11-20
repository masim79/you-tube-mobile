import React, { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { addToWatchLater, postReaction, removeFromWatchLater, type Video } from "../api/videos";
import { useApiClient } from "../api/useApiClient";
import { formatCompactNumber } from "../ui/format";
import { useTheme } from "../theme/ThemeProvider";

type Reaction = 1 | -1 | 0;

/** Signed change in a reaction's count bucket as `yourValue` moves from `from` to `to` — same arithmetic as the web's `action-pills.ts`. */
function reactionDelta(from: Reaction, to: Reaction, bucket: 1 | -1): number {
  const was = from === bucket ? 1 : 0;
  const is = to === bucket ? 1 : 0;
  return is - was;
}

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

  const [likeCount, setLikeCount] = useState(video.like_count ?? 0);
  const [dislikeCount, setDislikeCount] = useState(video.dislike_count ?? 0);
  const [yourReaction, setYourReaction] = useState<Reaction>((video.your_reaction ?? 0) as Reaction);
  const [isSaved, setIsSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);

  async function react(value: Reaction): Promise<void> {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const videoId = video.id;
    if (!videoId) return;

    const previousReaction = yourReaction;
    const previousLikes = likeCount;
    const previousDislikes = dislikeCount;
    const nextReaction: Reaction = previousReaction === value ? 0 : value;

    setYourReaction(nextReaction);
    setLikeCount(previousLikes + reactionDelta(previousReaction, nextReaction, 1));
    setDislikeCount(previousDislikes + reactionDelta(previousReaction, nextReaction, -1));

    try {
      const result = await postReaction(client, videoId, nextReaction);
      setLikeCount(result.like_count ?? previousLikes);
      setDislikeCount(result.dislike_count ?? previousDislikes);
      setYourReaction((result.your_value ?? nextReaction) as Reaction);
    } catch {
      // Silent rollback — same idempotent-endpoint convention as the web.
      setYourReaction(previousReaction);
      setLikeCount(previousLikes);
      setDislikeCount(previousDislikes);
    }
  }

  async function toggleSave(): Promise<void> {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const videoId = video.id;
    if (!videoId || savePending) return;
    const next = !isSaved;
    setIsSaved(next);
    setSavePending(true);
    try {
      if (next) {
        await addToWatchLater(client, videoId);
      } else {
        await removeFromWatchLater(client, videoId);
      }
    } catch {
      setIsSaved(!next);
    } finally {
      setSavePending(false);
    }
  }

  async function share(): Promise<void> {
    const videoId = video.id;
    const url = client.baseUrl && videoId ? `${client.baseUrl.replace(/\/+$/, "")}/watch/${videoId}` : null;
    if (!url) return;
    try {
      await Share.share({ message: url, url });
    } catch {
      // User-cancelled share sheets throw on some platforms — nothing to do.
    }
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
    </ScrollView>
  );
}

function Pill({
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
