import { File } from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { NetworkStateType, useNetworkState } from "expo-network";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../api/http";
import { useApiClient } from "../../api/useApiClient";
import { getRelatedVideos, getVideo, recordView, updateProgress, type Video } from "../../api/videos";
import { getDownloadForVideo } from "../../downloads/downloadRegistry";
import { ActionPills } from "../../engagement/ActionPills";
import { CommentsSheet } from "../../engagement/CommentsSheet";
import { SubscribeControl } from "../../engagement/SubscribeControl";
import { useMiniPlayer } from "../../player/miniPlayerStore";
import { VideoPlayer } from "../../player/VideoPlayer";
import { useAuth } from "../../store/AuthContext";
import { useSettings } from "../../store/SettingsContext";
import { useTheme } from "../../theme/ThemeProvider";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { formatCompactNumber, formatRelativeTime, resolveMediaUrl } from "../../ui/format";
import { LoadingState } from "../../ui/LoadingState";
import { Screen } from "../../ui/Screen";
import { VideoList } from "../../ui/VideoList";

const POLL_INTERVAL_MS = 4000;
const PROGRESS_SAVE_INTERVAL_MS = 8000;
const VIEW_HEARTBEAT_INTERVAL_MS = 10_000;

type PageState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "processing"; video: Video }
  | { kind: "failed"; video: Video }
  | { kind: "ready"; video: Video };

function makeSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * `/watch/:id` (PLAN.md §17.1 "Watch"/"Watch gestures"/"Mini-player", M1
 * chunk 4). Mirrors `vendor/you-tube/frontend/src/app/pages/watch/watch-page.ts`'s
 * lifecycle: polls `GET /videos/{id}` while `status` is
 * `uploading`/`processing`, resumes from the saved position once `ready`,
 * an 8s progress-save timer and a 10s view-heartbeat timer (only counted
 * while playing), and autoplay-next from the first related video.
 *
 * M2 chunk 2 closes chunk 4's documented autoplay gap: autoplay-next now
 * reads `settings.autoplayNext` (mirrors the web's `AutoplayPreferenceService`,
 * default on) instead of always firing, and Data Saver additionally
 * suppresses it specifically while on cellular (Wi-Fi autoplay is
 * unaffected either way — see `onPlaybackEnded`). The same chunk also
 * seeds the quality picker from `settings.defaultQualityWifi`/
 * `defaultQualityCellular` based on the live network type via
 * `expo-network`'s `useNetworkState()` — computed once per video (the
 * existing `key={video.id}` below already remounts `VideoPlayer` per
 * video, so this only ever applies at the start of a session, never
 * clobbering a manual pick from the quality menu mid-playback). Data Saver
 * also overrides the effective cellular quality to a fixed conservative
 * cap regardless of `defaultQualityCellular`'s own stored value — see
 * `effectiveQuality` below.
 *
 * Simplifications relative to the web page, noted rather than silently
 * dropped (same convention as `channel/[handle].tsx`'s file-header comment):
 *  - **Engagement (M1 chunk 6)** — like/dislike, subscribe + bell levels,
 *    comments, share, save — is wired via `ActionPills`/`SubscribeControl`/
 *    `CommentsSheet` in `src/engagement/`, not inline here. `SubscribeControl`
 *    starts every Watch-page view at `isSubscribed: false` and tracks it
 *    purely optimistically — `Video` carries no `is_subscribed` for the
 *    caller (only `Channel` does), same documented gap as the web's
 *    `channel-row.ts`.
 *  - **Background audio / PiP (M1 chunk 5)** are wired in `VideoPlayer`
 *    itself (`staysActiveInBackground`/`showNowPlayingNotification`/PiP
 *    props/manual button) rather than here — this screen just passes
 *    `title`/`channelName` through for the lock-screen "now playing" text.
 */
export default function WatchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const miniPlayer = useMiniPlayer();
  const { isAuthenticated } = useAuth();
  const settings = useSettings();
  const networkState = useNetworkState();
  const { id } = useLocalSearchParams<{ id: string }>();

  const isCellular = networkState.type === NetworkStateType.CELLULAR;
  // §17.1 Settings "data saver": caps cellular playback to a fixed
  // conservative quality regardless of what `defaultQualityCellular`
  // itself is set to — picked as "a concrete effect" per M2 chunk 2's
  // brief, distinct from the plain `defaultQualityCellular` preference.
  const DATA_SAVER_CELLULAR_CAP = 360;
  const effectiveQuality = isCellular
    ? settings.dataSaver
      ? DATA_SAVER_CELLULAR_CAP
      : settings.defaultQualityCellular
    : settings.defaultQualityWifi;

  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  /** Set once, right after reclaiming inline playback from the mini player — see `expandFromMiniPlayer`. */
  const [resumeOverrideS, setResumeOverrideS] = useState<number | null>(null);
  /**
   * `file://` URI of this video's on-device download (M2 chunk 4,
   * `downloads/downloadRegistry.ts`), when one exists and its file is
   * still actually there — `null` otherwise, which falls back to the
   * normal streamed `playback_url` below. Checked once per `id`, same
   * granularity as the poll-while-processing effect; a download that
   * finishes *while* this exact screen is already open is not picked up
   * until the next visit, a deliberate "minimal wiring" simplification
   * per this chunk's task packet rather than a second live subscription.
   * Also unaddressed: a downloaded file is one fixed rendition, not an
   * HLS master playlist, so `VideoPlayer`'s quality menu below still
   * lists the video's *streamable* renditions and silently no-ops when a
   * different one is picked while playing locally — not restructuring
   * `VideoPlayer` itself to hide/disable that menu for a local source was
   * the minimal-wiring tradeoff this chunk's task packet explicitly
   * allowed ("wire this minimally, don't restructure the player").
   */
  const [localPlaybackUri, setLocalPlaybackUri] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  /** Seeded from `video.comment_count` once ready, then adjusted locally as the comments sheet posts/deletes — see the reset in the id-keyed effect below. */
  const [commentCountOverride, setCommentCountOverride] = useState<number | null>(null);

  const playerStateRef = useRef<{ currentTimeS: number; isPlaying: boolean }>({ currentTimeS: 0, isPlaying: false });
  const readyVideoRef = useRef<Video | null>(null);
  const watchedSecondsRef = useRef(0);
  const lastSavedPositionRef = useRef(-1);
  const sessionIdRef = useRef(makeSessionId());

  const readyVideo = state.kind === "ready" ? state.video : null;
  readyVideoRef.current = readyVideo;

  const nextVideoId = relatedVideos[0]?.id ?? null;
  /** True when *this* video is the one currently floating in the mini player — mirrors the web's `isShownInMiniPlayer`. */
  const isShownInMiniPlayer = !!readyVideo?.id && miniPlayer.state?.videoId === readyVideo.id;

  const loadRelated = useCallback(
    async (videoId: string) => {
      setRelatedLoading(true);
      try {
        const page = await getRelatedVideos(client, videoId);
        setRelatedVideos(page.items ?? []);
      } catch {
        setRelatedVideos([]);
      } finally {
        setRelatedLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request]
  );

  // Poll while uploading/processing, settle on ready/failed/not-found —
  // keyed by `id` so navigating to a new video (autoplay-next, tapping a
  // related card) restarts tracking cleanly.
  useEffect(() => {
    if (!id) {
      setState({ kind: "not-found" });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    watchedSecondsRef.current = 0;
    lastSavedPositionRef.current = -1;
    sessionIdRef.current = makeSessionId();
    setResumeOverrideS(null);
    setState({ kind: "loading" });
    setRelatedVideos([]);
    setCommentsOpen(false);
    setCommentCountOverride(null);
    setLocalPlaybackUri(null);

    async function poll(): Promise<void> {
      try {
        const video = await getVideo(client, id);
        if (cancelled) return;
        if (video.status === "ready") {
          setState({ kind: "ready", video });
          if (video.id) void loadRelated(video.id);
          return;
        }
        if (video.status === "failed") {
          setState({ kind: "failed", video });
          return;
        }
        setState({ kind: "processing", video });
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: "not-found" });
          return;
        }
        // Transient network error — keep whatever's on screen, try again.
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, client.request, loadRelated]);

  // M2 chunk 4: prefer a local on-device download over streaming, when one
  // exists for this exact video and its file hasn't disappeared out from
  // under the registry (see `localPlaybackUri`'s own doc comment above).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getDownloadForVideo(id).then((entry) => {
      if (cancelled || !entry) return;
      let exists = false;
      try {
        exists = new File(entry.localPath).exists;
      } catch {
        exists = false;
      }
      if (!cancelled) setLocalPlaybackUri(exists ? entry.localPath : null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Progress-save (8s) + view-heartbeat (10s) timers, set up once per mount
  // (not per `id` — `readyVideoRef` always has the current video) with a
  // best-effort final save on unmount, mirroring the web page's
  // `ngOnDestroy`. A real device/OS can always kill the app without
  // running this cleanup — same documented gap as the web's own comment.
  useEffect(() => {
    const progressTimer = setInterval(() => {
      const video = readyVideoRef.current;
      if (!video?.id) return;
      const positionS = Math.floor(playerStateRef.current.currentTimeS);
      if (positionS === lastSavedPositionRef.current) return;
      lastSavedPositionRef.current = positionS;
      void updateProgress(client, video.id, positionS).catch(() => undefined);
    }, PROGRESS_SAVE_INTERVAL_MS);

    const heartbeatTimer = setInterval(() => {
      const video = readyVideoRef.current;
      if (!video?.id || !playerStateRef.current.isPlaying) return;
      watchedSecondsRef.current += VIEW_HEARTBEAT_INTERVAL_MS / 1000;
      void recordView(client, video.id, {
        watchedS: watchedSecondsRef.current,
        sessionId: sessionIdRef.current,
        source: "related",
      }).catch(() => undefined);
    }, VIEW_HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(progressTimer);
      clearInterval(heartbeatTimer);
      const video = readyVideoRef.current;
      if (video?.id) {
        const positionS = Math.floor(playerStateRef.current.currentTimeS);
        if (positionS !== lastSavedPositionRef.current) {
          void updateProgress(client, video.id, positionS).catch(() => undefined);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request]);

  function goToNextVideo(): void {
    if (nextVideoId) router.replace(`/watch/${nextVideoId}`);
  }

  function onPlaybackEnded(): void {
    const video = readyVideoRef.current;
    if (video?.id) {
      const positionS = Math.floor(playerStateRef.current.currentTimeS);
      lastSavedPositionRef.current = positionS;
      void updateProgress(client, video.id, positionS).catch(() => undefined);
    }
    // §17.1 Settings "autoplay" + "data saver" — see file-header doc
    // comment: the toggle gates it outright, and Data Saver additionally
    // suppresses it while on cellular regardless of the toggle.
    const autoplayAllowed = settings.autoplayNext && !(settings.dataSaver && isCellular);
    if (autoplayAllowed) goToNextVideo();
  }

  function onRequestCollapse({ positionS, isPlaying }: { positionS: number; isPlaying: boolean }): void {
    const video = readyVideoRef.current;
    if (!video?.id) return;
    miniPlayer.open({
      videoId: video.id,
      title: video.title ?? "",
      channelName: video.channel_name ?? null,
      channelAvatarUrl: resolveMediaUrl(client.baseUrl, video.channel_avatar_path),
      src: resolveMediaUrl(client.baseUrl, video.playback_url),
      poster: resolveMediaUrl(client.baseUrl, video.thumbnail_path),
      qualities: video.qualities ?? [],
      startAtS: positionS,
      autoplay: isPlaying,
    });
    if (router.canGoBack()) router.back();
  }

  /** The "Play here" prompt shown instead of a second inline player while this exact video is floating — reclaims it (mirrors the web's `expandFromMiniPlayer`). */
  function expandFromMiniPlayer(): void {
    setResumeOverrideS(miniPlayer.state?.startAtS ?? 0);
    miniPlayer.close();
  }

  function onPressRelatedVideo(video: Video): void {
    if (video.id) router.push(`/watch/${video.id}`);
  }

  if (state.kind === "loading") {
    return <LoadingState label="Loading video…" />;
  }

  if (state.kind === "not-found") {
    return (
      <Screen centered>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>This video could not be found.</Text>
      </Screen>
    );
  }

  if (state.kind === "processing") {
    return (
      <Screen>
        <View style={[styles.statusBox, { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md }]}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>
            Processing…
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}>
            This video is still being encoded. It'll be ready to watch shortly.
          </Text>
        </View>
      </Screen>
    );
  }

  if (state.kind === "failed") {
    return (
      <Screen>
        <View style={[styles.statusBox, { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md }]}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>
            Processing failed
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}>
            This video couldn't be encoded. Try again from a desktop browser.
          </Text>
        </View>
      </Screen>
    );
  }

  const video = state.video;
  const avatarUrl = resolveMediaUrl(client.baseUrl, video.channel_avatar_path);
  const publishedAt = video.published_at ? new Date(video.published_at) : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing[6] }} showsVerticalScrollIndicator={false}>
        {isShownInMiniPlayer ? (
          <View
            style={[
              styles.playHereWrap,
              { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md },
            ]}
          >
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing[2] }}>
              Playing in the mini player
            </Text>
            <Button label="Play here" onPress={expandFromMiniPlayer} variant="secondary" />
          </View>
        ) : (
          <VideoPlayer
            key={video.id}
            src={localPlaybackUri ?? resolveMediaUrl(client.baseUrl, video.playback_url)}
            poster={resolveMediaUrl(client.baseUrl, video.thumbnail_path)}
            title={video.title ?? undefined}
            channelName={video.channel_name ?? null}
            qualities={video.qualities ?? []}
            startAtS={resumeOverrideS ?? video.resume_position_s ?? null}
            initialQuality={effectiveQuality}
            autoplayOnAttach
            onPlaybackEnded={onPlaybackEnded}
            onPlaybackStateChange={(s) => {
              playerStateRef.current = { currentTimeS: s.currentTimeS, isPlaying: s.isPlaying };
            }}
            onRequestCollapse={onRequestCollapse}
          />
        )}

        <View style={{ padding: theme.spacing[4] }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700" }}>
            {video.title}
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}>
            {formatCompactNumber(video.view_count ?? 0)} views
            {publishedAt ? ` · ${formatRelativeTime(publishedAt)}` : ""}
          </Text>

          <View style={[styles.channelRow, { marginTop: theme.spacing[4] }]}>
            <Avatar uri={avatarUrl} name={video.channel_name ?? "?"} size={44} />
            <View style={[styles.channelMeta, { marginLeft: theme.spacing[3] }]}>
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }} numberOfLines={1}>
                {video.channel_name}
              </Text>
            </View>
            {video.channel_id ? (
              <SubscribeControl
                channelId={video.channel_id}
                initialIsSubscribed={false}
                isAuthenticated={isAuthenticated}
                onRequireAuth={() => router.push("/setup/login")}
                testIDPrefix="watch-subscribe"
              />
            ) : null}
          </View>

          <ActionPills
            key={video.id}
            video={video}
            commentCount={commentCountOverride ?? video.comment_count ?? 0}
            isAuthenticated={isAuthenticated}
            onRequireAuth={() => router.push("/setup/login")}
            onOpenComments={() => setCommentsOpen(true)}
          />

          {video.description ? (
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                marginTop: theme.spacing[4],
                lineHeight: theme.fontSize.sm * 1.4,
              }}
            >
              {video.description}
            </Text>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: theme.spacing[4] }}>
          <VideoList
            testID="related-videos"
            items={relatedVideos}
            baseUrl={client.baseUrl}
            isLoading={relatedLoading}
            isLoadingMore={false}
            error={null}
            onLoadMore={() => {}}
            onRefresh={() => video.id && loadRelated(video.id)}
            onPressVideo={onPressRelatedVideo}
            emptyLabel="No related videos yet."
          />
        </View>
      </ScrollView>

      <CommentsSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        videoId={video.id ?? ""}
        videoChannelId={video.channel_id ?? null}
        commentCount={commentCountOverride ?? video.comment_count ?? 0}
        onCommentCountChange={setCommentCountOverride}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusBox: {
    margin: 16,
    padding: 16,
  },
  playHereWrap: {
    margin: 16,
    padding: 16,
    alignItems: "flex-start",
  },
  channelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  channelMeta: {
    flex: 1,
    minWidth: 0,
  },
});
