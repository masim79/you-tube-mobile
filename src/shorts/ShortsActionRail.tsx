import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../api/useApiClient";
import type { Video } from "../api/videos";
import { shareVideo } from "../engagement/shareVideo";
import { useSavedState } from "../engagement/useSavedState";
import { useVideoReaction } from "../engagement/useVideoReaction";
import { PLAYER_CHROME } from "../player/playerChrome";
import { useTheme } from "../theme/ThemeProvider";
import { formatCompactNumber } from "../ui/format";

export interface ShortsActionRailProps {
  video: Video;
  commentCount: number;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onOpenComments: () => void;
}

/**
 * The right-edge vertical icon rail (PLAN.md §17.1 "Shorts feed... like/
 * comment in place"). Drives the exact same like/dislike/save/share calls
 * the Watch screen's `ActionPills` (M1 chunk 6) does, via
 * `useVideoReaction`/`useSavedState`/`shareVideo` — extracted out of
 * `ActionPills` during this chunk specifically so this rail does not
 * duplicate that API-calling logic, only its own rendering (a vertical
 * icon column over the video, YouTube Shorts' own *interaction pattern*,
 * not its asset — PLAN.md §17.4 — as opposed to `ActionPills`' horizontal
 * pill row, which assumes an opaque surface behind it that a full-bleed
 * video doesn't have).
 *
 * Icon/label colors deliberately use `PLAYER_CHROME` (always white-on-
 * video, the same documented exception `player/playerChrome.ts` carries
 * for the Watch screen's own chrome — this rail sits directly on video for
 * the same reason). The *selected* indicator behind an active icon still
 * comes from `useTheme()`'s real accent color, not a second chrome
 * constant: that's a brand/identity color, not theme-independent chrome,
 * the same distinction `VideoPlayer`'s own option sheets already draw
 * between `PLAYER_CHROME.text` (default) and `theme.colors.accent`
 * (selected).
 *
 * Comments open the same `CommentsSheet` bottom sheet the Watch screen
 * uses (owned by the caller, `ShortsFeedItem`) — "in place" here means
 * "without leaving the Shorts feed to a separate screen", which a sheet
 * already satisfies; it does not mean comments needed a new, non-sheet UI.
 *
 * Deliberately excludes `DownloadButton` (unlike `ActionPills`) — offline
 * download of a Short is real scope (M2 chunk 4's feature applies to any
 * video), but wiring it in was not part of this chunk's brief and is left
 * for a follow-up rather than silently bolted on here.
 */
export function ShortsActionRail({
  video,
  commentCount,
  isAuthenticated,
  onRequireAuth,
  onOpenComments,
}: ShortsActionRailProps) {
  const client = useApiClient();
  const { likeCount, dislikeCount, yourReaction, react } = useVideoReaction(video, isAuthenticated, onRequireAuth);
  const { isSaved, toggleSave } = useSavedState(video.id, isAuthenticated, onRequireAuth);

  return (
    <View style={styles.rail} pointerEvents="box-none">
      <RailButton
        icon="👍"
        label={formatCompactNumber(likeCount)}
        selected={yourReaction === 1}
        onPress={() => void react(1)}
        accessibilityLabel={`Like, ${formatCompactNumber(likeCount)}`}
        testID="shorts-action-like"
      />
      <RailButton
        icon="👎"
        selected={yourReaction === -1}
        onPress={() => void react(-1)}
        accessibilityLabel="Dislike"
        testID="shorts-action-dislike"
      />
      <RailButton
        icon="💬"
        label={formatCompactNumber(commentCount)}
        onPress={onOpenComments}
        accessibilityLabel={`Comments, ${formatCompactNumber(commentCount)}`}
        testID="shorts-action-comments"
      />
      <RailButton
        icon={isSaved ? "✓" : "＋"}
        label={isSaved ? "Saved" : "Save"}
        selected={isSaved}
        onPress={() => void toggleSave()}
        accessibilityLabel={isSaved ? "Saved" : "Save"}
        testID="shorts-action-save"
      />
      <RailButton
        icon="↗"
        label="Share"
        onPress={() => void shareVideo(client, video.id)}
        accessibilityLabel="Share"
        testID="shorts-action-share"
      />
    </View>
  );
}

/**
 * One icon+label cell of the rail — a top-level sibling function, not
 * nested inside `ShortsActionRail` (same convention `ActionPills.tsx`'s own
 * `Pill` uses), so it isn't redefined as a new component type on every
 * parent render.
 */
function RailButton({
  icon,
  label,
  selected = false,
  onPress,
  accessibilityLabel,
  testID,
}: {
  icon: string;
  label?: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      hitSlop={8}
      testID={testID}
      style={styles.button}
    >
      <View style={[styles.iconWrap, selected ? { backgroundColor: `${theme.colors.accent}40` } : null]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: "absolute",
    right: 12,
    bottom: 110,
    alignItems: "center",
  },
  button: {
    alignItems: "center",
    marginBottom: 20,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 26,
    color: PLAYER_CHROME.text,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: PLAYER_CHROME.text,
    marginTop: 2,
  },
});
