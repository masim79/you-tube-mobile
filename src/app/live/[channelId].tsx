import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { endLiveStream, getChannelLiveStatus, type LiveStream } from "../../api/live";
import { ApiError } from "../../api/http";
import { useApiClient } from "../../api/useApiClient";
import { LiveChatPanel } from "../../live/LiveChatPanel";
import { VideoPlayer } from "../../player/VideoPlayer";
import { useAuth } from "../../store/AuthContext";
import { useSettings } from "../../store/SettingsContext";
import { useTheme } from "../../theme/ThemeProvider";
import { Button } from "../../ui/Button";
import { LoadingState } from "../../ui/LoadingState";
import { Screen } from "../../ui/Screen";
import { formatCompactNumber, resolveMediaUrl } from "../../ui/format";

const LIVE_STATUS_POLL_MS = 10_000;

type PageState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "offline" }
  | { kind: "live"; stream: LiveStream };

/**
 * `/live/:channelId` (PLAN.md §17.1 "Live": "watch a live stream, live
 * chat, go-live notification", M4 chunk 3 — the final M4 chunk). Polls
 * `GET /channels/{id}/live` the same way `watch/[id].tsx` polls
 * `GET /videos/{id}` while processing: while `status !== "live"` it just
 * keeps checking (a viewer can arrive before the stream starts, e.g. from
 * the go-live push notification firing a moment before `on-publish`
 * actually flips the row), and once it *is* live it keeps polling anyway —
 * unlike a VOD's `status`, `viewer_count` and `slow_mode_s` both change
 * while live, and `status` itself can flip to `ended` at any moment from
 * the creator's own device or OBS disconnecting, which this screen needs
 * to notice without the viewer refreshing by hand.
 *
 * `channelName`/`channelHandle` are optional query params rather than a
 * new lookup: there is no `GET /channels/{id}` (only `PATCH`, owner-only —
 * same gap `notifications/deepLink.ts` already documents for
 * `community_post`), so this screen can only show a channel's real name
 * when it already has it in memory from wherever the viewer came from
 * (the Channel screen passes both; the go-live push notification's deep
 * link, not having either, falls back to a generic "Live" heading —
 * see `notifications/deepLink.ts`'s own doc comment on that gap).
 *
 * No mini-player support here (`onRequestCollapse` omitted) and no
 * resume-position/progress-save/view-heartbeat timers from the VOD watch
 * screen — none of those concepts apply to a live stream, which is why
 * this is its own screen rather than a branch inside `watch/[id].tsx`.
 */
export default function LiveWatchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { user, isAuthenticated } = useAuth();
  const settings = useSettings();
  const { channelId, channelName, channelHandle } = useLocalSearchParams<{
    channelId: string;
    channelName?: string;
    channelHandle?: string;
  }>();

  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [ending, setEnding] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const isOwnChannel = !!channelId && !!user?.channel_id && user.channel_id === channelId;

  const poll = useCallback(async () => {
    if (!channelId) return;
    // Tracked explicitly rather than left to `finally` — a bare `finally`
    // still runs after an early `return` inside the `try`/`catch` below,
    // which would otherwise keep rescheduling a poll even past the
    // "redirect away" and "not found" terminal states.
    let shouldReschedule = true;
    try {
      const stream = await getChannelLiveStatus(client, channelId);
      if (cancelledRef.current) return;
      if (stream.status === "ended" && stream.saved_video_id) {
        shouldReschedule = false;
        router.replace(`/watch/${stream.saved_video_id}`);
        return;
      }
      setState(stream.status === "live" ? { kind: "live", stream } : { kind: "offline" });
    } catch (error) {
      if (cancelledRef.current) return;
      if (error instanceof ApiError && error.status === 404) {
        shouldReschedule = false;
        setState({ kind: "not-found" });
        return;
      }
      // Transient network error — keep whatever's on screen and retry.
    } finally {
      if (!cancelledRef.current && shouldReschedule) {
        pollTimerRef.current = setTimeout(() => void poll(), LIVE_STATUS_POLL_MS);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, client.request, router]);

  useEffect(() => {
    cancelledRef.current = false;
    setState({ kind: "loading" });
    void poll();
    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function handleEndStream(streamId: string | undefined): Promise<void> {
    if (!streamId) return;
    Alert.alert("End live stream?", "This stops the broadcast for everyone watching.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End stream",
        style: "destructive",
        onPress: async () => {
          setEnding(true);
          try {
            // `saved_video_id` only populates once `save_live_stream`
            // finishes — not waited on here. Falling back to "offline"
            // either way is fine: the next poll tick (or a manual
            // revisit) picks up `ended`+`saved_video_id` and redirects to
            // the saved video via the same branch the poll loop above uses.
            await endLiveStream(client, streamId);
            setState({ kind: "offline" });
          } catch (err) {
            Alert.alert(
              "Couldn't end stream",
              err instanceof ApiError ? err.message : "Please try again."
            );
          } finally {
            setEnding(false);
          }
        },
      },
    ]);
  }

  if (state.kind === "loading") {
    return <LoadingState label="Checking stream…" />;
  }

  if (state.kind === "not-found") {
    return (
      <Screen centered>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>This channel could not be found.</Text>
      </Screen>
    );
  }

  if (state.kind === "offline") {
    return (
      <Screen centered>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600", textAlign: "center" }}>
          {channelName ? `${channelName} isn't live right now.` : "This channel isn't live right now."}
        </Text>
        {channelHandle ? (
          <View style={{ marginTop: theme.spacing[4] }}>
            <Button label="Visit channel" onPress={() => router.push(`/channel/${channelHandle}`)} />
          </View>
        ) : null}
      </Screen>
    );
  }

  const stream = state.stream;
  const playbackUrl = resolveMediaUrl(client.baseUrl, stream.playback_url);

  return (
    <Screen>
      <View style={styles.column}>
        <VideoPlayer
          key={stream.id}
          src={playbackUrl}
          title={stream.title ?? channelName ?? "Live"}
          channelName={channelName ?? null}
          qualities={[]}
          startAtS={null}
          autoplayOnAttach
          captionStyle={settings.captionStyle}
        />

        <View style={[styles.metaRow, { marginTop: theme.spacing[3] }]}>
          <View style={[styles.liveBadge, { backgroundColor: theme.colors.accent, borderRadius: theme.radius.sm }]}>
            <Text style={{ color: theme.colors.accentContrast, fontSize: theme.fontSize.xs, fontWeight: "700" }}>
              LIVE
            </Text>
          </View>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginLeft: theme.spacing[2] }}>
            {formatCompactNumber(stream.viewer_count ?? 0)} watching
          </Text>
          <View style={{ flex: 1 }} />
          {isOwnChannel ? (
            <Button
              label={ending ? "Ending…" : "End stream"}
              variant="secondary"
              onPress={() => void handleEndStream(stream.id)}
              loading={ending}
              testID="live-end-stream"
            />
          ) : null}
        </View>

        <Text
          style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600", marginTop: theme.spacing[2] }}
          numberOfLines={2}
        >
          {stream.title ?? channelName ?? "Live stream"}
        </Text>

        <View style={{ flex: 1, marginTop: theme.spacing[3] }}>
          <LiveChatPanel
            streamId={stream.id ?? ""}
            enabled={!!stream.id}
            canModerate={isOwnChannel || user?.role === "admin" || user?.role === "moderator"}
            slowModeS={stream.slow_mode_s ?? 0}
            isAuthenticated={isAuthenticated}
            onRequireAuth={() => router.push("/setup/login")}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
