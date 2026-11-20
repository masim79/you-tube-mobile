import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ApiError } from "../../api/http";
import { useApiClient } from "../../api/useApiClient";
import { getRelatedVideos, getVideo, recordView, updateProgress, type Video } from "../../api/videos";
import { useMiniPlayer } from "../../player/miniPlayerStore";
import { VideoPlayer } from "../../player/VideoPlayer";
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
 * Simplifications relative to the web page, noted rather than silently
 * dropped (same convention as `channel/[handle].tsx`'s file-header comment):
 *  - **No persisted autoplay-next preference.** The web honours
 *    `AutoplayPreferenceService`; mobile has no Settings screen yet (that's
 *    M2, per PLAN.md §17.1's "Settings" row) to store the toggle in, so
 *    autoplay-next always runs here. A later chunk wiring Settings should
 *    gate this the same way the web does.
 *  - **Engagement is a stub.** Like/dislike/subscribe/comments are M1
 *    chunk 6's job — the channel row below renders a disabled-looking
 *    Subscribe button as an obvious slot rather than wiring a real toggle.
 *  - **Background audio / PiP are chunk 5.** This screen's player keeps
 *    playing while the app is foregrounded only; nothing here reaches for
 *    `expo-video`'s PiP APIs or changes `app.config.ts`'s background modes.
 */
export default function WatchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const miniPlayer = useMiniPlayer();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  /** Set once, right after reclaiming inline playback from the mini player — see `expandFromMiniPlayer`. */
  const [resumeOverrideS, setResumeOverrideS] = useState<number | null>(null);

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
    goToNextVideo(); // always-on autoplay-next — see file-header doc comment.
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
            src={resolveMediaUrl(client.baseUrl, video.playback_url)}
            poster={resolveMediaUrl(client.baseUrl, video.thumbnail_path)}
            title={video.title ?? undefined}
            qualities={video.qualities ?? []}
            startAtS={resumeOverrideS ?? video.resume_position_s ?? null}
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
            {/*
             * Subscribe slot for M1 chunk 6 (engagement/comments): disabled
             * on purpose — real subscribe/bell-level wiring, plus
             * like/dislike and the comments bottom sheet, land there. Kept
             * visually present (not omitted) so the layout doesn't shift
             * once chunk 6 wires it up.
             */}
            <Button label="Subscribe" onPress={() => {}} disabled testID="subscribe-button-stub" />
          </View>

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
