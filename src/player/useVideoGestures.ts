import { useEffect, useMemo, useRef, useState } from "react";
import { Gesture } from "react-native-gesture-handler";
import * as Brightness from "expo-brightness";

/**
 * YouTube's watch-screen gesture set (PLAN.md §17.1 "Watch gestures"): double
 * tap the left/right edge to seek ±10s, drag vertically on the left for
 * screen brightness and on the right for volume, pinch to zoom-to-fill, and
 * swipe down (from the centre column) to collapse to the mini player.
 *
 * One `GestureDetector` covers the whole player surface rather than three
 * separately-detected zone views — `react-native-gesture-handler` gesture
 * objects are meant to be attached to exactly one detector each, so
 * "three zones" are resolved *inside* a single Pan/Tap gesture's callbacks
 * by checking `event.x` against `containerWidthRef` (updated from the
 * surface's `onLayout`, read fresh on every gesture rather than captured
 * at hook-creation time, since the inline <-> fullscreen surface resizes).
 *
 * **Known gap (documented, not silently dropped):** the right-hand drag
 * controls `VideoPlayer`'s own `player.volume` (an in-app gain, 0..1), not
 * the OS media-volume HUD YouTube shows — there is no Expo-maintained
 * system-volume API, and pulling in an unvetted community native module
 * (e.g. `react-native-volume-manager`) for one gesture, untested on a real
 * device this chunk, was judged not worth the risk. Left as a documented
 * gap for a later chunk to pick up if system-volume control is wanted.
 */

const SEEK_STEP_S = 10;
/** Vertical px dragged to sweep the full 0..1 range of brightness/volume. */
const DRAG_RANGE_PX = 180;
/** Minimum downward translation (center column) to trigger collapse/exit-fullscreen. */
const SWIPE_DOWN_THRESHOLD_PX = 90;
const TAP_MAX_DURATION_MS = 250;

export type SeekFlashDirection = "forward" | "backward" | null;

export interface VideoGestureOverlayState {
  seekFlash: SeekFlashDirection;
  /** 0-100, non-null only while the left-column drag is active (plus a short lingering display). */
  brightnessPct: number | null;
  /** 0-100, non-null only while the right-column drag is active (plus a short lingering display). */
  volumePct: number | null;
}

export interface UseVideoGesturesParams {
  /** False in compact (mini-player widget) mode — no gesture surface there. */
  enabled: boolean;
  onSeekBy: (deltaS: number) => void;
  onToggleControls: () => void;
  /** Reads the player's current volume (0..1) at the start of a right-column drag. */
  getVolume: () => number;
  onVolumeChange: (value: number) => void;
  onZoomChange: (zoomed: boolean) => void;
  /** Center-column swipe down — collapse to mini player (portrait) or exit fullscreen. */
  onSwipeDown: () => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

type Zone = "left" | "center" | "right";

function zoneFor(x: number, width: number): Zone {
  if (width <= 0) return "center";
  const third = width / 3;
  if (x < third) return "left";
  if (x > width - third) return "right";
  return "center";
}

export function useVideoGestures({
  enabled,
  onSeekBy,
  onToggleControls,
  getVolume,
  onVolumeChange,
  onZoomChange,
  onSwipeDown,
}: UseVideoGesturesParams) {
  const [overlay, setOverlay] = useState<VideoGestureOverlayState>({
    seekFlash: null,
    brightnessPct: null,
    volumePct: null,
  });
  const [containerWidth, setContainerWidth] = useState(0);

  const widthRef = useRef(0);
  widthRef.current = containerWidth;

  // Mirrors of the latest callback props/values — kept so the gesture
  // objects below don't need to be rebuilt (and re-attached to the
  // detector) every time a parent re-render hands down new closures.
  const callbacksRef = useRef({ onSeekBy, onToggleControls, getVolume, onVolumeChange, onZoomChange, onSwipeDown });
  callbacksRef.current = { onSeekBy, onToggleControls, getVolume, onVolumeChange, onZoomChange, onSwipeDown };

  const panZoneRef = useRef<Zone | null>(null);
  const brightnessStartRef = useRef(0.5);
  const volumeStartRef = useRef(1);
  const seekFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayLingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (seekFlashTimerRef.current) clearTimeout(seekFlashTimerRef.current);
      if (overlayLingerTimerRef.current) clearTimeout(overlayLingerTimerRef.current);
    },
    []
  );

  function flashSeek(direction: Exclude<SeekFlashDirection, null>) {
    if (seekFlashTimerRef.current) clearTimeout(seekFlashTimerRef.current);
    setOverlay((current) => ({ ...current, seekFlash: direction }));
    seekFlashTimerRef.current = setTimeout(() => {
      setOverlay((current) => ({ ...current, seekFlash: null }));
    }, 500);
  }

  function lingerThenClear(key: "brightnessPct" | "volumePct") {
    if (overlayLingerTimerRef.current) clearTimeout(overlayLingerTimerRef.current);
    overlayLingerTimerRef.current = setTimeout(() => {
      setOverlay((current) => ({ ...current, [key]: null }));
    }, 600);
  }

  const composedGesture = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(TAP_MAX_DURATION_MS)
      .runOnJS(true)
      .enabled(enabled)
      .onEnd((event) => {
        const zone = zoneFor(event.x, widthRef.current);
        if (zone === "left") {
          callbacksRef.current.onSeekBy(-SEEK_STEP_S);
          flashSeek("backward");
        } else if (zone === "right") {
          callbacksRef.current.onSeekBy(SEEK_STEP_S);
          flashSeek("forward");
        }
      });

    const singleTap = Gesture.Tap()
      .maxDuration(TAP_MAX_DURATION_MS)
      .runOnJS(true)
      .enabled(enabled)
      .onEnd(() => callbacksRef.current.onToggleControls());

    const pan = Gesture.Pan()
      .runOnJS(true)
      .enabled(enabled)
      .activeOffsetY([-12, 12])
      .failOffsetX([-24, 24])
      .onStart((event) => {
        const zone = zoneFor(event.x, widthRef.current);
        panZoneRef.current = zone;
        if (zone === "left") {
          Brightness.getBrightnessAsync()
            .then((value) => {
              brightnessStartRef.current = value;
            })
            .catch(() => {
              brightnessStartRef.current = 0.5;
            });
        } else if (zone === "right") {
          volumeStartRef.current = callbacksRef.current.getVolume();
        }
      })
      .onUpdate((event) => {
        const zone = panZoneRef.current;
        if (zone === "left") {
          const next = clamp01(brightnessStartRef.current - event.translationY / DRAG_RANGE_PX);
          setOverlay((current) => ({ ...current, brightnessPct: Math.round(next * 100) }));
          Brightness.setBrightnessAsync(next).catch(() => {
            // No permission, or unsupported device — the drag still tracks
            // visually via `brightnessPct`, it just doesn't change anything.
          });
        } else if (zone === "right") {
          const next = clamp01(volumeStartRef.current - event.translationY / DRAG_RANGE_PX);
          setOverlay((current) => ({ ...current, volumePct: Math.round(next * 100) }));
          callbacksRef.current.onVolumeChange(next);
        }
        // zone === "center": no visual feedback until release (checked in onEnd below).
      })
      .onEnd((event) => {
        const zone = panZoneRef.current;
        if (zone === "center" && event.translationY > SWIPE_DOWN_THRESHOLD_PX && Math.abs(event.translationX) < 60) {
          callbacksRef.current.onSwipeDown();
        }
        if (zone === "left") lingerThenClear("brightnessPct");
        if (zone === "right") lingerThenClear("volumePct");
        panZoneRef.current = null;
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .enabled(enabled)
      .onEnd((event) => {
        if (event.scale > 1.15) callbacksRef.current.onZoomChange(true);
        else if (event.scale < 0.87) callbacksRef.current.onZoomChange(false);
      });

    return Gesture.Simultaneous(Gesture.Exclusive(doubleTap, singleTap), pan, pinch);
    // Rebuilt only when `enabled` changes — every other input is read
    // through `callbacksRef`/`widthRef` so this doesn't need to depend on
    // them (each individual gesture's own `.enabled()` above is what
    // actually gates recognition; rebuilding on `enabled` toggles just
    // keeps the composition honest about why it changed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const onLayout = (width: number) => setContainerWidth(width);

  return { gesture: composedGesture, overlay, onLayout };
}
