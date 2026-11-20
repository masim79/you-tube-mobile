import { useRouter } from "expo-router";
import React, { useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ThemeProvider";
import { useMiniPlayer } from "./miniPlayerStore";
import { VideoPlayer } from "./VideoPlayer";

/**
 * Approximate height of the bottom tab bar (PLAN.md §17.4: "the mini-player
 * sits above the tab bar"). There's no exported constant for it from
 * `(tabs)/_layout.tsx` (a plain `<Tabs/>`'s rendered height isn't knowable
 * without measuring it at runtime), so this is a fixed estimate rather than
 * a measured value — close enough that the mini-player doesn't visually
 * overlap the tab bar's labels on either platform, not pixel-exact.
 */
const TAB_BAR_HEIGHT_ESTIMATE = 56;
const DISMISS_THRESHOLD_PX = 90;

/**
 * Rendered once near the root (`src/app/_layout.tsx`), a sibling of the
 * router's `<Stack/>` so it survives every in-app navigation (PLAN.md
 * §17.1 "Mini-player": "persistent bottom mini-player that survives
 * navigation, with swipe to dismiss"). Renders nothing when
 * `MiniPlayerProvider`'s state is null.
 *
 * Tapping the row expands back to `/watch/{id}` at the carried position —
 * `WatchScreen` checks `state?.videoId === id` on mount and, when it
 * matches, closes the mini player immediately rather than running two
 * players for the same video (mirrors the web's `isShownInMiniPlayer`).
 * Swiping the row horizontally past the threshold dismisses it outright
 * (closes the floating player, stops playback) rather than expanding it.
 */
export function MiniPlayer() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, close, updatePosition } = useMiniPlayer();
  const lastReportedPositionRef = useRef(0);
  const closeRef = useRef(close);
  closeRef.current = close;

  // `useMemo` (not recreated every render) — `MiniPlayer` re-renders about
  // once a second from `updatePosition` below, and rebuilding a Gesture
  // object on every render re-attaches it to the detector, which can reset
  // its in-progress recognition state mid-swipe.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-10, 10])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (Math.abs(event.translationX) > DISMISS_THRESHOLD_PX) {
            closeRef.current();
          }
        }),
    []
  );

  if (!state) return null;

  function expand(): void {
    if (!state) return;
    router.push(`/watch/${state.videoId}`);
  }

  return (
    <GestureDetector gesture={swipe}>
      <View
        style={[
          styles.container,
          {
            bottom: TAB_BAR_HEIGHT_ESTIMATE + insets.bottom,
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          },
        ]}
        testID="mini-player"
      >
        <Pressable onPress={expand} style={styles.row} accessibilityRole="button" accessibilityLabel={`Open ${state.title}`}>
          <VideoPlayer
            key={state.videoId}
            src={state.src}
            poster={state.poster}
            title={state.title}
            channelName={state.channelName}
            qualities={state.qualities}
            startAtS={state.startAtS}
            compact
            autoplayOnAttach={state.autoplay}
            onPlaybackStateChange={({ currentTimeS }) => {
              // Throttled to whole seconds — `updatePosition` triggers a
              // context re-render, so this shouldn't fire on every 0.5s tick.
              const rounded = Math.floor(currentTimeS);
              if (rounded !== lastReportedPositionRef.current) {
                lastReportedPositionRef.current = rounded;
                updatePosition(rounded);
              }
            }}
          />
          <View style={[styles.meta, { paddingHorizontal: theme.spacing[3] }]}>
            <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: "600" }}>
              {state.title}
            </Text>
            {state.channelName ? (
              <Text numberOfLines={1} style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>
                {state.channelName}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close mini player"
          hitSlop={8}
          style={{ paddingHorizontal: theme.spacing[3] }}
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.lg }}>✕</Text>
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 8,
    right: 8,
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    overflow: "hidden",
    // §17.1 accessibility floor — every phase: 44pt minimum touch target
    // (the row as a whole is 68pt tall, well above it).
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
});
