import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { PLAYER_CHROME } from "../player/playerChrome";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

export interface ShortsVideoSurfaceProps {
  /** Absolute, already-`resolveMediaUrl`-resolved playback URL — `null` while the video is still processing/not yet known. */
  src: string | null;
  /** Only the active page in `ShortsPager`'s mounted window actually plays — every other one stays paused and silent. */
  isActive: boolean;
}

/**
 * The minimal `expo-video` surface for one Shorts feed page (PLAN.md §17.1
 * "Shorts feed": autoplay, loop, tap to pause/play). Deliberately **not**
 * a reuse of `player/VideoPlayer.tsx`: that component's chrome (quality/
 * speed/captions/fullscreen menus) and its `useVideoGestures` layer
 * (double-tap seek, brightness/volume drag, swipe-down-to-collapse) are
 * built for the Watch screen's single, horizontal video and would directly
 * fight `ShortsPager`'s own vertical swipe-between-videos pan gesture —
 * two `Gesture.Pan()`s on one surface is exactly the kind of conflict
 * `useVideoGestures`'s own file-header comment describes needing a single
 * detector to avoid. Shorts also has no quality/speed/captions UI in scope
 * (§17.1's Shorts row lists autoplay/loop/like/comment only), so there is
 * no chrome to reuse in the first place — this wraps the same underlying
 * `expo-video` primitives at the much smaller surface area this screen
 * actually needs.
 *
 * Also honors the OS "reduce motion" accessibility preference for the
 * *autoplay* half of this screen (PLAN.md §21.4's accessibility floor) —
 * see `useReducedMotionPreference`.
 */
export function ShortsVideoSurface({ src, isActive }: ShortsVideoSurfaceProps) {
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
  });
  const reduceMotion = useReducedMotionPreference();

  const lastSrcRef = useRef<string | null>(null);
  useEffect(() => {
    if (!src || src === lastSrcRef.current) {
      if (!src) lastSrcRef.current = null;
      return;
    }
    lastSrcRef.current = src;
    player.replaceAsync(src).catch(() => undefined);
  }, [src, player]);

  // Only the active page plays — every other mounted page (the one-page
  // lookahead/lookbehind window `ShortsPager` keeps alive for a smooth
  // swipe) stays paused, mirroring the one-video-plays-at-a-time
  // convention every Shorts/Reels-style feed uses. `reduceMotion` (PLAN.md
  // §21.4's accessibility floor, "Reduced-motion preference honoured...
  // Shorts autoplay") additionally suppresses the *auto*play half of that
  // — becoming active still resets/shows the page, it just doesn't start
  // playing on its own; the tap-to-play affordance below still works.
  useEffect(() => {
    if (isActive) {
      player.currentTime = 0;
      if (!reduceMotion) player.play();
    } else {
      player.pause();
    }
  }, [isActive, player, reduceMotion]);

  const [isPlaying, setIsPlaying] = useState(isActive && !reduceMotion);
  useEventListener(player, "playingChange", (event) => setIsPlaying(event.isPlaying));

  function togglePlay(): void {
    if (player.playing) player.pause();
    else player.play();
  }

  return (
    <Pressable
      style={styles.fill}
      onPress={togglePlay}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? "Pause" : "Play"}
      testID="shorts-video-surface"
    >
      <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls={false} contentFit="cover" />
      {!isPlaying ? (
        <Text style={styles.pausedGlyph} pointerEvents="none">
          ▶
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: PLAYER_CHROME.background,
    alignItems: "center",
    justifyContent: "center",
  },
  pausedGlyph: {
    color: PLAYER_CHROME.text,
    fontSize: 56,
    opacity: 0.85,
  },
});
