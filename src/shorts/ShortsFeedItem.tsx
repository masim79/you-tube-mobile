import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApiClient } from "../api/useApiClient";
import type { Video } from "../api/videos";
import { CommentsSheet } from "../engagement/CommentsSheet";
import { SubscribeControl } from "../engagement/SubscribeControl";
import { PLAYER_CHROME } from "../player/playerChrome";
import { Avatar } from "../ui/Avatar";
import { resolveMediaUrl } from "../ui/format";
import { ShortsActionRail } from "./ShortsActionRail";
import { ShortsVideoSurface } from "./ShortsVideoSurface";

export interface ShortsFeedItemProps {
  video: Video;
  isActive: boolean;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onPressChannel?: (handle: string) => void;
}

/**
 * One full-screen page of the Shorts feed (PLAN.md §17.1): `ShortsVideoSurface`
 * full-bleed, a bottom-left channel/caption block, and the right-edge
 * `ShortsActionRail`. Give this component a `key={video.id}` at the call
 * site (`ShortsPager` already does, via its own page wrapper) — same
 * convention as `ActionPills`/`VideoPlayer`: its engagement state is seeded
 * once from `video` and does not re-sync for a different id without
 * remounting.
 *
 * The caption text is `video.title` — PLAN.md §17.1's "text overlay"
 * creation step (M4 chunk 1, `(tabs)/create.tsx`) writes into this same
 * field rather than a separate contract field that doesn't exist (see that
 * file's own doc comment for the full reasoning): what the creator types
 * as the overlay *is* what renders here as the overlay, not two things
 * that happen to agree by convention.
 */
export function ShortsFeedItem({ video, isActive, isAuthenticated, onRequireAuth, onPressChannel }: ShortsFeedItemProps) {
  const client = useApiClient();
  const insets = useSafeAreaInsets();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCountOverride, setCommentCountOverride] = useState<number | null>(null);

  const avatarUrl = resolveMediaUrl(client.baseUrl, video.channel_avatar_path);
  const commentCount = commentCountOverride ?? video.comment_count ?? 0;

  return (
    <View style={styles.page}>
      <ShortsVideoSurface src={resolveMediaUrl(client.baseUrl, video.playback_url)} isActive={isActive} />

      <View style={[styles.captionBlock, { paddingBottom: Math.max(16, insets.bottom + 8) }]} pointerEvents="box-none">
        <View style={styles.channelRow}>
          <Pressable
            onPress={() => video.channel_handle && onPressChannel?.(video.channel_handle)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={video.channel_name ?? "Channel"}
            style={styles.channelPressable}
          >
            <Avatar uri={avatarUrl} name={video.channel_name ?? "?"} size={32} />
            <Text numberOfLines={1} style={styles.channelName}>
              {video.channel_name}
            </Text>
          </Pressable>
          {video.channel_id ? (
            <View style={styles.subscribeWrap}>
              <SubscribeControl
                channelId={video.channel_id}
                initialIsSubscribed={false}
                isAuthenticated={isAuthenticated}
                onRequireAuth={onRequireAuth}
                testIDPrefix="shorts-subscribe"
              />
            </View>
          ) : null}
        </View>
        {video.title ? (
          <Text numberOfLines={2} style={styles.caption}>
            {video.title}
          </Text>
        ) : null}
      </View>

      <ShortsActionRail
        video={video}
        commentCount={commentCount}
        isAuthenticated={isAuthenticated}
        onRequireAuth={onRequireAuth}
        onOpenComments={() => setCommentsOpen(true)}
      />

      <CommentsSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        videoId={video.id ?? ""}
        videoChannelId={video.channel_id ?? null}
        commentCount={commentCount}
        onCommentCountChange={setCommentCountOverride}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: PLAYER_CHROME.background,
  },
  captionBlock: {
    position: "absolute",
    left: 0,
    right: 72,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 24,
    // A flat, semi-opaque backdrop behind the caption text — the same
    // "literal translucent chrome color, not a theme token at reduced
    // opacity" convention `VideoPlayer`'s own HUDs/seek-flash and
    // `BottomSheet`'s scrim already use, for the same reason: this needs
    // to read as a dimming scrim over *video*, not a themed surface panel.
    backgroundColor: `${PLAYER_CHROME.background}66`,
  },
  channelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  channelPressable: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  channelName: {
    color: PLAYER_CHROME.text,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 8,
    flexShrink: 1,
  },
  subscribeWrap: {
    marginLeft: 12,
  },
  caption: {
    color: PLAYER_CHROME.text,
    fontSize: 14,
    marginTop: 8,
  },
});
