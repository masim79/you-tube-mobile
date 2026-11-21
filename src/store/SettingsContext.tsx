import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { QualityId } from "../player/qualityOptions";
import { useThemeControls } from "../theme/ThemeProvider";
import type { ThemeSetting } from "../theme";

/**
 * Client-local UI preferences (PLAN.md §17.1's Settings row: "Theme
 * light/dark/system, default quality split by Wi-Fi vs cellular, download
 * quality, autoplay, data saver, caption styling, clear history"). Every
 * field here is confirmed client-only before writing this — there is no
 * `/me/settings` (or similar) endpoint in `vendor/you-tube/contracts/openapi.yaml`,
 * same category as `recentSearches.ts`'s recent-search terms and the
 * web's own `AutoplayPreferenceService` (plain `localStorage`, no
 * server round-trip, "the phase packet is explicit that autoplay-next is
 * client-side UI state"). Non-sensitive, so plain `AsyncStorage` rather
 * than the keychain-backed `expo-secure-store` `secureStorage.ts` uses for
 * the refresh token (§20.2) — same tier as `recentSearches.ts`.
 *
 * Two fields are stored now but not wired to anything yet, documented
 * plainly rather than faked:
 *  - `downloadQuality` — for M2 chunk 4's Offline/downloads feature,
 *    which doesn't exist yet.
 *  - `captionStyle` — for M3's caption renderer, which doesn't exist yet;
 *    there's nothing on screen today for a font-size/background toggle to
 *    visibly affect.
 */
export interface CaptionStyle {
  fontSize: "small" | "medium" | "large";
  /** Whether the (future) caption renderer should draw its text on a dark background plate. */
  backgroundEnabled: boolean;
}

export interface Settings {
  /** Mirrors `ThemeProvider`'s `themeSetting` — see the hydration effect below for how the two stay in sync. */
  themeSetting: ThemeSetting;
  /** Gates `watch/[id].tsx`'s autoplay-next — default `true`, matching the web's own `AutoplayPreferenceService` default. */
  autoplayNext: boolean;
  /**
   * When on: forces the effective cellular playback quality down to a
   * fixed conservative cap (see `watch/[id].tsx`'s `useEffectiveQuality`
   * usage) regardless of `defaultQualityCellular`'s own value, and
   * suppresses autoplay-next specifically while on cellular (Wi-Fi
   * autoplay is unaffected either way).
   */
  dataSaver: boolean;
  defaultQualityWifi: QualityId;
  defaultQualityCellular: QualityId;
  /** Not yet consumed — see file header. */
  downloadQuality: QualityId;
  /** Not yet consumed — see file header. */
  captionStyle: CaptionStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  themeSetting: "dark",
  autoplayNext: true,
  dataSaver: false,
  defaultQualityWifi: "auto",
  defaultQualityCellular: 480,
  downloadQuality: "auto",
  captionStyle: { fontSize: "medium", backgroundEnabled: true },
};

const STORAGE_KEY = "ht_settings";

function parseStored(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      captionStyle: { ...DEFAULT_SETTINGS.captionStyle, ...(parsed as Partial<Settings>).captionStyle },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsContextValue extends Settings {
  /** `false` until the one-time `AsyncStorage` read resolves — everything above is `DEFAULT_SETTINGS` until then. */
  isLoaded: boolean;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Must be mounted *inside* `ThemeProvider` (see `_layout.tsx`) — it calls
 * `useThemeControls()` to push the persisted theme choice into
 * `ThemeProvider`, which otherwise always boots dark-by-default
 * (§17.4/§19.3) and has no persistence of its own.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { setThemeName } = useThemeControls();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const loaded = parseStored(raw);
        if (!cancelled) setSettings(loaded);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Applies `settings.themeSetting` to `ThemeProvider` on every change —
  // the initial hydration above, and any live edit from the Settings
  // screen. Runs once at mount with the `DEFAULT_SETTINGS` value too
  // (harmless: it matches `ThemeProvider`'s own default), then again once
  // hydration resolves with whatever was actually stored.
  useEffect(() => {
    setThemeName(settings.themeSetting);
  }, [settings.themeSetting, setThemeName]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      isLoaded,
      update: (key, val) => {
        setSettings((prev) => {
          const next = { ...prev, [key]: val };
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      },
    }),
    [settings, isLoaded]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings() must be called within a <SettingsProvider>");
  return ctx;
}
