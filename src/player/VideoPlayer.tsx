import { useEvent, useEventListener } from "expo";
import * as ScreenOrientation from "expo-screen-orientation";
import { isPictureInPictureSupported, useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";

import { useTheme } from "../theme/ThemeProvider";
import { formatDuration } from "../ui/format";
import { findActiveCueText, parseCaptionCues, type CaptionCue } from "./captionCues";
import { PLAYER_CHROME } from "./playerChrome";
import { PLAYBACK_RATE_STEPS, qualityOptionsFromHeights, type QualityId } from "./qualityOptions";
import { useVideoGestures } from "./useVideoGestures";

export interface VideoPlaybackState {
  currentTimeS: number;
  isPlaying: boolean;
  durationS: number;
}

/**
 * One ready, fetchable `.vtt`/`.srt` track from `GET /videos/{id}/captions`
 * — already filtered to `status === "ready"` && `path` set, and `path`
 * already resolved to an absolute URL via `resolveMediaUrl`, by the caller
 * (`watch/[id].tsx`), same as every other media path in this app.
 */
export interface CaptionTrackOption {
  id: string;
  language: string;
  label: string;
  url: string;
}

/** Mirrors `SettingsContext.CaptionStyle`'s shape structurally (not imported, to keep `player/` free of a dependency on `store/`) — `watch/[id].tsx` passes `settings.captionStyle` straight through. */
export interface CaptionStyleOption {
  fontSize: "small" | "medium" | "large";
  backgroundEnabled: boolean;
}

const DEFAULT_CAPTION_STYLE: CaptionStyleOption = { fontSize: "medium", backgroundEnabled: true };

/** Imperative handle for actions a parent screen needs to trigger on the player directly — currently just the chapters list's exact seek-by-chapter (PLAN.md §17.1), distinct from the gesture layer's relative ±10s seek. */
export interface VideoPlayerHandle {
  seekTo: (positionS: number) => void;
}

export interface VideoPlayerProps {
  /** Absolute, already-resolved playback URL (`master.m3u8`) — `null` while the video is still processing. */
  src: string | null;
  /** Absolute, already-resolved poster/thumbnail URL. */
  poster?: string | null;
  title?: string;
  /** Shown as the lock-screen/notification "now playing" subtitle (`VideoMetadata.artist`) — absent/no-op in compact mode, same as `title`. */
  channelName?: string | null;
  /** `Video.qualities` — rendition heights, e.g. `[360, 720]`; the picker's fallback until real tracks load. */
  qualities?: readonly number[];
  /** Resume position (`Video.resume_position_s`) — seeked to once, on the first `sourceLoad`. */
  startAtS?: number | null;
  /**
   * Seeds the quality picker's initial selection (M2 chunk 2's
   * network-aware default quality, PLAN.md §17.1) — applied once, the
   * same way `startAtS` is, and never re-applied afterwards, so a manual
   * pick from the quality menu later in the session is never clobbered.
   * Defaults to `"auto"`, same as the menu's own default.
   */
  initialQuality?: QualityId;
  /** Mini-player widget mode: no gesture surface, no quality/speed/fullscreen/mini-player controls — just play/pause. */
  compact?: boolean;
  /** Starts playing as soon as the source loads, instead of paused (mini-player widget only). */
  autoplayOnAttach?: boolean;
  loop?: boolean;
  onPlaybackEnded?: () => void;
  /** Fired on every `timeUpdate`/`playingChange` — the watch screen reads this into a ref for its progress-save/view-heartbeat timers rather than polling. */
  onPlaybackStateChange?: (state: VideoPlaybackState) => void;
  /** Swipe-down gesture or the explicit mini-player button — absent/no-op in compact mode (nothing to collapse further to). */
  onRequestCollapse?: (state: { positionS: number; isPlaying: boolean }) => void;
  onPlaybackError?: (message: string) => void;
  /** `GET /videos/{id}/captions`, pre-filtered to ready tracks — see `CaptionTrackOption`. Empty/absent hides the CC button entirely (mirrors `qualities`/`compact`: nothing to offer, nothing shown). */
  captionTracks?: readonly CaptionTrackOption[];
  /** `SettingsContext`'s `captionStyle` — applied to whichever cue is currently active. */
  captionStyle?: CaptionStyleOption;
}

const CONTROLS_AUTO_HIDE_MS = 3000;
const MIN_RATE = PLAYBACK_RATE_STEPS[0] ?? 0.25;
const MAX_RATE = PLAYBACK_RATE_STEPS[PLAYBACK_RATE_STEPS.length - 1] ?? 2;

/**
 * The `expo-video` wrapper (PLAN.md §17.1 "Watch": portrait pinned, tap to
 * fullscreen landscape, quality picker, speed, loop, ambient mode) plus the
 * gesture layer from `useVideoGestures`. Fullscreen is **not**
 * `VideoView`'s own native fullscreen — `VideoView.exitFullscreen()`'s own
 * doc comment warns the Android JS runtime is paused while in native
 * fullscreen, which would kill every gesture here. Instead, "fullscreen" is
 * a plain full-bleed `Modal` rendering this exact same surface, with
 * `expo-screen-orientation` locking to landscape while it's open — the
 * gesture layer and custom controls keep working identically in both modes.
 *
 * Background audio / lock-screen controls / Picture-in-Picture (PLAN.md
 * §17.1 "Background & PiP", M1 chunk 5): `staysActiveInBackground` and
 * `showNowPlayingNotification` are set unconditionally on every player
 * instance below — both are no-ops unless `app.config.ts`'s `expo-video`
 * plugin options (`supportsBackgroundPlayback`/`supportsPictureInPicture`)
 * are on, which they are. PiP itself (`allowsPictureInPicture` +
 * `startsPictureInPictureAutomatically` on `VideoView`, plus the manual
 * button below) is scoped to `!compact` — the mini-player widget is already
 * an in-app floating surface, so a second, OS-level floating window over it
 * would be redundant rather than useful.
 *
 * Known gap, not fixed here: the mini-player and the inline/fullscreen
 * player are *separate* `VideoPlayer` instances (each owns its own
 * `useVideoPlayer`), so if a mini-player for video A is floating while the
 * viewer opens the watch screen for a *different* video B, both instances
 * have `showNowPlayingNotification`/background playback active
 * simultaneously. `expo-video`'s docs note only one player can hold PiP at
 * a time, but say nothing about two concurrent now-playing sessions —
 * unverified without a device; flagged for a later chunk if it misbehaves.
 */
export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  {
    src,
    poster = null,
    title,
    channelName = null,
    qualities = [],
    startAtS = null,
    initialQuality = "auto",
    compact = false,
    autoplayOnAttach = false,
    loop = false,
    onPlaybackEnded,
    onPlaybackStateChange,
    onRequestCollapse,
    onPlaybackError,
    captionTracks = [],
    captionStyle = DEFAULT_CAPTION_STYLE,
  }: VideoPlayerProps,
  ref
) {
  const theme = useTheme();

  const player = useVideoPlayer(null, (p) => {
    p.loop = loop;
    p.timeUpdateEventInterval = 0.5;
    // §17.1 "Background & PiP": keep playing audio with the app
    // backgrounded/screen locked, and surface lock-screen/notification
    // transport controls. Both are no-ops unless `app.config.ts`'s
    // `expo-video` plugin has `supportsBackgroundPlayback: true` (see that
    // file's comment) — true on every platform this targets, so these are
    // set unconditionally rather than gated on `compact`.
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
  });

  const lastAttachedSrcRef = useRef<string | null>(null);
  const resumedRef = useRef(false);
  const autoplayTriggeredRef = useRef(false);
  const videoViewRef = useRef<VideoView>(null);
  const [isInPictureInPicture, setIsInPictureInPicture] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);

  useEffect(() => {
    try {
      setPipSupported(isPictureInPictureSupported());
    } catch {
      setPipSupported(false);
    }
  }, []);

  useEffect(() => {
    if (!src || src === lastAttachedSrcRef.current) {
      if (!src) lastAttachedSrcRef.current = null;
      return;
    }
    lastAttachedSrcRef.current = src;
    resumedRef.current = false;
    autoplayTriggeredRef.current = false;
    // An object source (rather than a bare string) carries the
    // lock-screen/notification "now playing" metadata — `title`/`artist`/
    // `artwork` feed `VideoMetadata`, which `showNowPlayingNotification`
    // above displays. Falls back to the bare string when there's no title
    // to show (e.g. a caller that never passes one), since `metadata` with
    // every field `undefined` is equivalent but noisier to read.
    const source: VideoSource = title
      ? { uri: src, metadata: { title, artist: channelName ?? undefined, artwork: poster ?? undefined } }
      : src;
    player.replaceAsync(source).catch(() => onPlaybackError?.("Could not load this video."));
  }, [src, title, channelName, poster, player, onPlaybackError]);

  async function enterPictureInPicture(): Promise<void> {
    try {
      await videoViewRef.current?.startPictureInPicture();
    } catch {
      // Device/OS declines (unsupported, another player already holds PiP,
      // or the app isn't in a PiP-eligible state) — no UI for this beyond
      // the button simply not having visibly done anything.
    }
  }

  // Exact seek for the watch screen's chapters list ("seek-by-chapter",
  // PLAN.md §17.1) — the gesture layer's own seek is a relative ±10s delta
  // (`seekBy` below), not an absolute position, so this is a separate
  // imperative entry point rather than a reuse of that gesture math.
  useImperativeHandle(
    ref,
    () => ({
      seekTo: (positionS: number) => {
        player.currentTime = Math.max(0, positionS);
      },
    }),
    [player]
  );

  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { playbackRate } = useEvent(player, "playbackRateChange", { playbackRate: player.playbackRate });

  const [durationS, setDurationS] = useState(0);
  const [currentTimeS, setCurrentTimeS] = useState(0);
  const [trackHeights, setTrackHeights] = useState<number[]>([]);

  useEventListener(player, "sourceLoad", (payload) => {
    setDurationS(Number.isFinite(payload.duration) ? payload.duration : 0);
    const heights = payload.availableVideoTracks
      .map((t) => t.size.height)
      .filter((h) => h > 0);
    if (heights.length > 0) setTrackHeights(heights);

    if (!resumedRef.current && startAtS && startAtS > 0 && payload.duration > startAtS + 1) {
      player.currentTime = startAtS;
    }
    resumedRef.current = true;

    if (!autoplayTriggeredRef.current && autoplayOnAttach) {
      autoplayTriggeredRef.current = true;
      player.play();
    }
  });

  useEventListener(player, "timeUpdate", (payload) => {
    setCurrentTimeS(payload.currentTime);
  });

  useEventListener(player, "playToEnd", () => {
    onPlaybackEnded?.();
  });

  useEffect(() => {
    onPlaybackStateChange?.({ currentTimeS, isPlaying, durationS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTimeS, isPlaying, durationS]);

  // Captions (§17.1 "Captions toggle with styling") — off by default,
  // matching the web's own documented "cosmetic, off by default" intent
  // before this chunk made it real. `null` means off; otherwise an id into
  // `captionTracks`. `captionCues` is this track's parsed `.vtt`/`.srt`
  // (see `captionCues.ts`'s header comment for why this app parses the
  // file itself rather than handing `expo-video` a URL) — refetched
  // whenever the selection changes, and cleared when it's turned off.
  const [captionsMenuOpen, setCaptionsMenuOpen] = useState(false);
  const [selectedCaptionTrackId, setSelectedCaptionTrackId] = useState<string | null>(null);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);

  useEffect(() => {
    const track = selectedCaptionTrackId
      ? captionTracks.find((t) => t.id === selectedCaptionTrackId)
      : undefined;
    if (!track) {
      setCaptionCues([]);
      return;
    }
    let cancelled = false;
    setCaptionCues([]);
    fetch(track.url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setCaptionCues(parseCaptionCues(text));
      })
      .catch(() => {
        if (!cancelled) setCaptionCues([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaptionTrackId, captionTracks]);

  // Reuses the `timeUpdate`-driven `currentTimeS` state above rather than a
  // second position-polling loop — the same state already feeds
  // `onPlaybackStateChange` and the seek-bar fill below.
  const activeCaptionText = useMemo(
    () => findActiveCueText(captionCues, currentTimeS),
    [captionCues, currentTimeS]
  );
  const captionFontSizePx =
    captionStyle.fontSize === "small"
      ? theme.fontSize.sm
      : captionStyle.fontSize === "large"
        ? theme.fontSize.lg
        : theme.fontSize.md;

  function toggleOrOpenCaptionsMenu(): void {
    if (captionTracks.length <= 1) {
      setSelectedCaptionTrackId((prev) => (prev ? null : captionTracks[0]?.id ?? null));
    } else {
      setCaptionsMenuOpen(true);
    }
  }

  const qualityOptions = useMemo(
    () => qualityOptionsFromHeights(trackHeights.length > 0 ? trackHeights : qualities),
    [trackHeights, qualities]
  );
  const [selectedQuality, setSelectedQuality] = useState<QualityId>(initialQuality);
  const initialQualityAppliedRef = useRef(false);

  // Applies the seeded `initialQuality` to the player exactly once — a
  // plain `useState` initializer already covers the picker's own label,
  // but `player.maxResolution` is a player-side effect that has to run
  // after `useVideoPlayer` constructs the player, same reasoning as
  // `startAtS`'s `resumedRef` above. Guarded by a ref rather than keyed
  // on `selectedQuality` so a later *manual* pick from the quality menu
  // (which also updates `selectedQuality`) is never re-applied here.
  useEffect(() => {
    if (initialQualityAppliedRef.current) return;
    initialQualityAppliedRef.current = true;
    if (initialQuality !== "auto") {
      player.maxResolution = { width: 100000, height: initialQuality };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(loop);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showControlsFor(ms: number): void {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), ms);
  }

  useEffect(() => {
    showControlsFor(CONTROLS_AUTO_HIDE_MS);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleControlsVisibility(): void {
    if (controlsVisible) {
      setControlsVisible(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      showControlsFor(CONTROLS_AUTO_HIDE_MS);
    }
  }

  function togglePlay(): void {
    if (player.playing) player.pause();
    else player.play();
    showControlsFor(CONTROLS_AUTO_HIDE_MS);
  }

  function seekBy(deltaS: number): void {
    player.seekBy(deltaS);
    showControlsFor(CONTROLS_AUTO_HIDE_MS);
  }

  function setQuality(id: QualityId): void {
    setSelectedQuality(id);
    setQualityMenuOpen(false);
    player.maxResolution = id === "auto" ? null : { width: 100000, height: id };
  }

  function setRate(rate: number): void {
    player.playbackRate = Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
    setSpeedMenuOpen(false);
  }

  function toggleLoop(): void {
    const next = !loopEnabled;
    player.loop = next;
    setLoopEnabled(next);
  }

  async function toggleFullscreen(): Promise<void> {
    const next = !isFullscreen;
    setIsFullscreen(next);
    try {
      await ScreenOrientation.lockAsync(
        next ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
    } catch {
      // Device/OS disallows the lock (e.g. a tablet with rotation locked by
      // the user) — the Modal still renders full-bleed either way, it just
      // won't force the rotation.
    }
  }

  function requestCollapse(): void {
    onRequestCollapse?.({ positionS: Math.floor(player.currentTime), isPlaying: player.playing });
  }

  const { gesture, overlay, onLayout: onGestureLayout } = useVideoGestures({
    enabled: !compact,
    onSeekBy: seekBy,
    onToggleControls: toggleControlsVisibility,
    getVolume: () => player.volume,
    onVolumeChange: (value) => {
      player.volume = value;
      player.muted = value < 0.02;
    },
    onZoomChange: setIsZoomed,
    onSwipeDown: () => {
      if (isFullscreen) void toggleFullscreen();
      else requestCollapse();
    },
  });

  function handleSurfaceLayout(event: LayoutChangeEvent): void {
    onGestureLayout(event.nativeEvent.layout.width);
  }

  const surface = (
    <View
      style={[styles.surface, compact ? styles.surfaceCompact : styles.surfaceInline]}
      onLayout={handleSurfaceLayout}
    >
      {poster && !isPlaying ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}

      <VideoView
        ref={videoViewRef}
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={false}
        contentFit={isZoomed ? "cover" : "contain"}
        fullscreenOptions={{ enable: false }}
        // PiP is only offered from the full/inline surface, never the
        // in-app mini-player widget (see the component's doc comment) —
        // `startsPictureInPictureAutomatically` auto-enters it when the app
        // backgrounds while this surface is the one mounted, matching the
        // YouTube app's own behavior; the manual button below covers
        // devices/OS versions where the automatic path isn't available
        // (its own doc says Android 12+).
        allowsPictureInPicture={!compact}
        startsPictureInPictureAutomatically={!compact}
        onPictureInPictureStart={() => setIsInPictureInPicture(true)}
        onPictureInPictureStop={() => setIsInPictureInPicture(false)}
      />

      {!compact && !isInPictureInPicture ? (
        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      ) : null}

      {!compact && overlay.seekFlash ? (
        <View
          pointerEvents="none"
          style={[
            styles.seekFlash,
            overlay.seekFlash === "backward" ? styles.seekFlashLeft : styles.seekFlashRight,
          ]}
        >
          <Text style={[styles.seekFlashText, { fontFamily: theme.fontFamily }]}>
            {overlay.seekFlash === "backward" ? "−10s" : "+10s"}
          </Text>
        </View>
      ) : null}

      {!compact && overlay.brightnessPct !== null ? (
        <View pointerEvents="none" style={[styles.hud, styles.hudLeft, { backgroundColor: `${theme.colors.bg}cc` }]}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm }}>☼ {overlay.brightnessPct}%</Text>
        </View>
      ) : null}

      {!compact && overlay.volumePct !== null ? (
        <View pointerEvents="none" style={[styles.hud, styles.hudRight, { backgroundColor: `${theme.colors.bg}cc` }]}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm }}>
            {overlay.volumePct === 0 ? "🔇" : "🔊"} {overlay.volumePct}%
          </Text>
        </View>
      ) : null}

      {/*
        Captions overlay — deliberately rendered outside the
        `controlsVisible`-gated chrome below, so cues stay on screen while
        the auto-hiding controls are hidden (mirrors every real player,
        captions aren't "chrome"). Hidden in PiP for the same reason the
        HUDs/seek-flash above are: no room in the shrunk floating window.
      */}
      {!compact && !isInPictureInPicture && activeCaptionText ? (
        <View pointerEvents="none" style={styles.captionWrap}>
          <Text
            style={[
              styles.captionText,
              {
                color: PLAYER_CHROME.text,
                fontSize: captionFontSizePx,
                fontFamily: theme.fontFamily,
                backgroundColor: captionStyle.backgroundEnabled ? `${PLAYER_CHROME.background}cc` : "transparent",
              },
            ]}
          >
            {activeCaptionText}
          </Text>
        </View>
      ) : null}

      {compact ? (
        <Pressable
          onPress={togglePlay}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
          style={[styles.compactPlayButton, { backgroundColor: `${theme.colors.bg}99` }]}
        >
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg }}>{isPlaying ? "❙❙" : "▶"}</Text>
        </Pressable>
      ) : controlsVisible && !isInPictureInPicture ? (
        // Hidden while this view's own PiP window is active (`§17.1`
        // "Background & PiP") — there's no room for this chrome in the
        // shrunk floating window, and the OS supplies its own transport
        // controls there independent of `nativeControls={false}` above.
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={[styles.topBar, { paddingHorizontal: theme.spacing[3] }]} pointerEvents="box-none">
            {title ? (
              <Text numberOfLines={1} style={{ color: PLAYER_CHROME.text, fontSize: theme.fontSize.sm, flex: 1 }}>
                {title}
              </Text>
            ) : null}
            {onRequestCollapse ? (
              <Pressable onPress={requestCollapse} accessibilityRole="button" accessibilityLabel="Mini player" hitSlop={8}>
                <Text style={{ color: PLAYER_CHROME.text, fontSize: theme.fontSize.md }}>▁</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={togglePlay}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
            style={styles.centerPlayButton}
          >
            <Text style={{ color: PLAYER_CHROME.text, fontSize: 40 }}>{isPlaying ? "❙❙" : "▶"}</Text>
          </Pressable>

          <View style={[styles.bottomBar, { paddingHorizontal: theme.spacing[3], paddingBottom: theme.spacing[2] }]}>
            <View style={styles.seekTrack}>
              <View
                style={[
                  styles.seekFill,
                  {
                    width: durationS > 0 ? `${Math.min(100, (currentTimeS / durationS) * 100)}%` : "0%",
                    backgroundColor: theme.colors.accent,
                  },
                ]}
              />
            </View>
            <View style={[styles.bottomRow, { marginTop: theme.spacing[1] }]}>
              <Text style={{ color: PLAYER_CHROME.text, fontSize: theme.fontSize.xs }}>
                {formatDuration(currentTimeS)} / {formatDuration(durationS)}
              </Text>
              <View style={styles.bottomActions}>
                <Pressable onPress={toggleLoop} accessibilityRole="button" accessibilityLabel="Loop" hitSlop={8}>
                  <Text style={{ color: loopEnabled ? theme.colors.accent : PLAYER_CHROME.text, fontSize: theme.fontSize.sm }}>
                    ↻
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSpeedMenuOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Playback speed"
                  hitSlop={8}
                  style={{ marginLeft: theme.spacing[3] }}
                >
                  <Text style={{ color: PLAYER_CHROME.text, fontSize: theme.fontSize.sm }}>{playbackRate}x</Text>
                </Pressable>
                {captionTracks.length > 0 ? (
                  <Pressable
                    onPress={toggleOrOpenCaptionsMenu}
                    accessibilityRole="button"
                    accessibilityLabel="Captions"
                    accessibilityState={{ selected: !!selectedCaptionTrackId }}
                    hitSlop={8}
                    style={{ marginLeft: theme.spacing[3] }}
                  >
                    <Text
                      style={{
                        color: selectedCaptionTrackId ? theme.colors.accent : PLAYER_CHROME.text,
                        fontSize: theme.fontSize.sm,
                        fontWeight: "700",
                      }}
                    >
                      CC
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setQualityMenuOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Quality"
                  hitSlop={8}
                  style={{ marginLeft: theme.spacing[3] }}
                >
                  <Text style={{ color: PLAYER_CHROME.text, fontSize: theme.fontSize.sm }}>
                    {selectedQuality === "auto" ? "Auto" : `${selectedQuality}p`}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={toggleFullscreen}
                  accessibilityRole="button"
                  accessibilityLabel={isFullscreen ? "Exit full screen" : "Full screen"}
                  hitSlop={8}
                  style={{ marginLeft: theme.spacing[3] }}
                >
                  <Text style={{ color: PLAYER_CHROME.text, fontSize: theme.fontSize.sm }}>{isFullscreen ? "⤡" : "⤢"}</Text>
                </Pressable>
                {pipSupported ? (
                  <Pressable
                    onPress={enterPictureInPicture}
                    accessibilityRole="button"
                    accessibilityLabel="Picture in picture"
                    hitSlop={8}
                    style={{ marginLeft: theme.spacing[3] }}
                  >
                    <Text style={{ color: PLAYER_CHROME.text, fontSize: theme.fontSize.sm }}>⧉</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );

  // `surface` is the exact same VideoView/gesture/controls tree whether
  // shown inline or fullscreen — but it must only ever be *mounted* in one
  // place at a time (two mounted VideoViews sharing one `player` would
  // double-render and let the hidden copy's gesture layer fight the
  // visible one for touches), so the inline branch below is gated on
  // `!isFullscreen` and the `Modal` only mounts its own copy once
  // `isFullscreen` flips true — RN's `Modal` renders `null` (not its
  // children) while `visible` is false, confirmed from
  // `react-native/Libraries/Modal/Modal.js`, so this really is
  // mutually exclusive, not just visually.
  return (
    <>
      {compact ? (
        surface
      ) : !isFullscreen ? (
        // Ambient mode (§17.1): a blurred, oversized rendering of the poster
        // behind the sharp player box. There is no clean, already-available
        // way to sample a dominant/average colour from the live video frame
        // without a new native dependency (`expo-video`'s thumbnail
        // generation produces still images, not a per-frame colour sample) —
        // this uses React Native's built-in `Image blurRadius` (no extra
        // dependency) against the thumbnail instead, the lighter-weight
        // approximation the task brief allows.
        <View style={[styles.ambientWrap, { paddingVertical: theme.spacing[4] }]}>
          {poster ? (
            <Image
              source={{ uri: poster }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              blurRadius={30}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.surfaceRaised }]} />
          )}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `${theme.colors.bg}66` }]} />
          {surface}
        </View>
      ) : null}

      <Modal visible={isFullscreen && !compact} animationType="fade" supportedOrientations={["landscape"]} onRequestClose={() => void toggleFullscreen()}>
        <View style={[styles.fullscreenModal, { backgroundColor: PLAYER_CHROME.background }]}>{surface}</View>
      </Modal>

      <OptionSheet
        visible={qualityMenuOpen}
        title="Quality"
        onClose={() => setQualityMenuOpen(false)}
        options={qualityOptions.map((option) => ({
          key: String(option.id),
          label: option.label,
          selected: option.id === selectedQuality,
          onPress: () => setQuality(option.id),
        }))}
      />
      <OptionSheet
        visible={speedMenuOpen}
        title="Playback speed"
        onClose={() => setSpeedMenuOpen(false)}
        options={PLAYBACK_RATE_STEPS.map((rate) => ({
          key: String(rate),
          label: `${rate}x`,
          selected: Math.abs(rate - playbackRate) < 0.001,
          onPress: () => setRate(rate),
        }))}
      />
      <OptionSheet
        visible={captionsMenuOpen}
        title="Captions"
        onClose={() => setCaptionsMenuOpen(false)}
        options={[
          {
            key: "off",
            label: "Off",
            selected: !selectedCaptionTrackId,
            onPress: () => {
              setSelectedCaptionTrackId(null);
              setCaptionsMenuOpen(false);
            },
          },
          ...captionTracks.map((track) => ({
            key: track.id,
            label: track.label,
            selected: track.id === selectedCaptionTrackId,
            onPress: () => {
              setSelectedCaptionTrackId(track.id);
              setCaptionsMenuOpen(false);
            },
          })),
        ]}
      />
    </>
  );
});

interface OptionSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  options: { key: string; label: string; selected: boolean; onPress: () => void }[];
}

/** Minimal bottom-sheet-style option list for the quality/speed/captions menus — kept local to `player/` rather than added to `ui/`, since nothing else needs it yet. */
function OptionSheet({ visible, title, onClose, options }: OptionSheetProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close menu">
        <View style={[styles.sheet, { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md }]}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: "600",
              padding: theme.spacing[3],
            }}
          >
            {title.toUpperCase()}
          </Text>
          {options.map((option) => (
            <Pressable
              key={option.key}
              onPress={option.onPress}
              style={[styles.sheetRow, { paddingHorizontal: theme.spacing[4], paddingVertical: theme.spacing[3] }]}
              accessibilityRole="button"
              accessibilityLabel={option.label}
            >
              <Text style={{ color: option.selected ? theme.colors.accent : theme.colors.text, fontSize: theme.fontSize.md }}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ambientWrap: {
    width: "100%",
    overflow: "hidden",
  },
  surface: {
    backgroundColor: PLAYER_CHROME.background,
    overflow: "hidden",
  },
  surfaceInline: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  surfaceCompact: {
    width: 120,
    height: 68,
    borderRadius: 8,
  },
  fullscreenModal: {
    flex: 1,
    justifyContent: "center",
  },
  seekFlash: {
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -18 }],
  },
  seekFlashLeft: { left: "12%" },
  seekFlashRight: { right: "12%" },
  seekFlashText: { color: PLAYER_CHROME.text, fontSize: 18, fontWeight: "700" },
  hud: {
    position: "absolute",
    top: "40%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  hudLeft: { left: "10%" },
  hudRight: { right: "10%" },
  captionWrap: {
    position: "absolute",
    left: "6%",
    right: "6%",
    bottom: "16%",
    alignItems: "center",
  },
  captionText: {
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  compactPlayButton: {
    position: "absolute",
    right: 6,
    top: "50%",
    transform: [{ translateY: -16 }],
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    gap: 12,
  },
  centerPlayButton: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -24 }, { translateY: -24 }],
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  seekTrack: {
    height: 3,
    backgroundColor: PLAYER_CHROME.trackBackground,
    borderRadius: 2,
    overflow: "hidden",
  },
  seekFill: {
    height: "100%",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: PLAYER_CHROME.sheetBackdrop,
  },
  sheet: {
    paddingBottom: 24,
  },
  sheetRow: {
    flexDirection: "row",
  },
});
