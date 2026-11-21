import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The OS-level "reduce motion" accessibility preference (PLAN.md §21.4's
 * accessibility floor: "Reduced-motion preference honoured (hover
 * previews, Shorts autoplay)"). Read once at mount and kept live via
 * `AccessibilityInfo`'s own change event — the same "OS setting, subscribed
 * live" shape `ThemeProvider`'s `useColorScheme()` already relies on for
 * the (different) system-appearance preference.
 *
 * `ShortsVideoSurface` is this hook's only caller: when the preference is
 * on, the active page in the Shorts feed starts paused instead of
 * autoplaying — the viewer can still tap to play, same as any paused page.
 */
export function useReducedMotionPreference(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduceMotion(value);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value: boolean) => {
      setReduceMotion(value);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
