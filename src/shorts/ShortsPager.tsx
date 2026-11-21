import React, { useCallback, useEffect, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
/** Fling fast enough (px/s) to advance a page even without crossing `SWIPE_DISTANCE_THRESHOLD_PX`. */
const SWIPE_VELOCITY_THRESHOLD = 500;
/** Drag far enough (px) to advance a page even at low velocity. */
const SWIPE_DISTANCE_THRESHOLD_PX = SCREEN_HEIGHT * 0.2;
const SPRING_CONFIG = { damping: 30, stiffness: 300, mass: 0.6 };
/** How many pages beyond the active one stay mounted — a full-bleed HLS `VideoView` per page is expensive, so only a small lookahead/lookbehind window is kept alive at all (PLAN.md §17.2/§17.7 perf concerns). */
const MOUNT_WINDOW = 1;

export interface ShortsPagerProps<T> {
  items: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number, isActive: boolean) => React.ReactNode;
  onActiveIndexChange?: (index: number) => void;
  /** Fires once the active page is within `prefetchDistance` of the end of `items` — drives `loadMore()`. */
  onNearEnd?: () => void;
  prefetchDistance?: number;
}

/**
 * A full-screen, one-page-at-a-time vertical pager driven entirely by
 * `react-native-reanimated` shared values and a single `react-native-
 * gesture-handler` `Gesture.Pan()` (PLAN.md §17 stack: "Use Reanimated for
 * the swipe gestures") — this is the first real use of Reanimated in this
 * app; the watch screen's own gestures (`useVideoGestures`) are plain
 * `gesture-handler` callbacks run with `.runOnJS(true)`, not Reanimated
 * worklets, because none of that screen's gestures drive a continuous
 * animated transform the way this pager's drag does.
 *
 * Deliberately not a `FlatList` with `pagingEnabled` (which would also
 * satisfy "swipe between full-screen pages" with far less code): a native
 * `ScrollView`'s paging snap is driven by the platform's own scroll
 * physics, which this task's own brief calls out by name as needing
 * Reanimated instead — and a plain `FlatList` offers no obvious hook for
 * the velocity/distance-based "did the fling clear the next page" decision
 * `onEnd` below makes, short of also wiring `onMomentumScrollEnd` math on
 * top of it, which ends up no simpler.
 *
 * Only mounts a small window of pages around the active one (`MOUNT_WINDOW`)
 * — each page's `renderItem` typically owns a full `expo-video` surface,
 * and mounting every item in a feed that can grow to hundreds would be a
 * real memory/perf problem, not just a cosmetic one.
 */
export function ShortsPager<T>({
  items,
  keyExtractor,
  renderItem,
  onActiveIndexChange,
  onNearEnd,
  prefetchDistance = 3,
}: ShortsPagerProps<T>) {
  const offset = useSharedValue(0);
  const dragStartOffset = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const maxIndex = Math.max(0, items.length - 1);

  const commitIndex = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(0, index), maxIndex);
      setActiveIndex(clamped);
      onActiveIndexChange?.(clamped);
      if (onNearEnd && items.length > 0 && items.length - 1 - clamped <= prefetchDistance) {
        onNearEnd();
      }
    },
    [maxIndex, onActiveIndexChange, onNearEnd, items.length, prefetchDistance]
  );

  // `activeIndex` can end up past the live `maxIndex` if the feed shrinks
  // (not expected from `loadMore`'s own append-only shape, but defensive
  // all the same) — re-clamp and re-home the shared offset rather than
  // leaving the pager parked past the last real page.
  useEffect(() => {
    if (activeIndex > maxIndex) {
      offset.value = maxIndex * SCREEN_HEIGHT;
      setActiveIndex(maxIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxIndex]);

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onStart(() => {
      dragStartOffset.value = offset.value;
    })
    .onUpdate((event) => {
      const next = dragStartOffset.value - event.translationY;
      const min = 0;
      const max = maxIndex * SCREEN_HEIGHT;
      offset.value = Math.min(max, Math.max(min, next));
    })
    .onEnd((event) => {
      const currentIndexFloat = offset.value / SCREEN_HEIGHT;
      let targetIndex = Math.round(currentIndexFloat);
      const flungFast = Math.abs(event.velocityY) > SWIPE_VELOCITY_THRESHOLD;
      const draggedFar = Math.abs(event.translationY) > SWIPE_DISTANCE_THRESHOLD_PX;
      if (flungFast || draggedFar) {
        targetIndex = event.translationY < 0 ? Math.ceil(currentIndexFloat) : Math.floor(currentIndexFloat);
      }
      targetIndex = Math.min(Math.max(0, targetIndex), maxIndex);
      offset.value = withSpring(targetIndex * SCREEN_HEIGHT, SPRING_CONFIG);
      runOnJS(commitIndex)(targetIndex);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.container}>
        {items.map((item, index) => {
          if (Math.abs(index - activeIndex) > MOUNT_WINDOW) return null;
          return (
            <ShortsPagerPage key={keyExtractor(item, index)} index={index} offset={offset}>
              {renderItem(item, index, index === activeIndex)}
            </ShortsPagerPage>
          );
        })}
      </View>
    </GestureDetector>
  );
}

/**
 * One page's positioning — a dedicated child component (not an inline
 * `useAnimatedStyle` call inside `ShortsPager`'s own `.map`) so each page
 * calls the hook exactly once per its own mount/unmount, rather than a
 * variable number of hook calls inside one render of the parent, which
 * would break the Rules of Hooks the moment the mounted window shifts.
 */
function ShortsPagerPage({
  index,
  offset,
  children,
}: {
  index: number;
  offset: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: index * SCREEN_HEIGHT - offset.value }],
  }));
  return <Animated.View style={[styles.page, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  page: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
  },
});
