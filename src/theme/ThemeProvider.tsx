import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { DEFAULT_THEME_NAME, nativeThemes, type NativeTheme, type ThemeName, type ThemeSetting } from "./index";

interface ThemeContextValue {
  /** The resolved theme actually in effect right now — `"system"` is already resolved to `"dark"`/`"light"` here. */
  theme: NativeTheme;
  themeName: ThemeName;
  /** The raw preference, including `"system"` — what the Settings screen's theme picker should show as selected. */
  themeSetting: ThemeSetting;
  setThemeName: (setting: ThemeSetting) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Dark-by-default theme context (PLAN.md §17.4/§19.3). `setThemeName` is
 * exposed so M2's settings screen (light/dark/system) has something to
 * call into — M0 itself never shows a theme switcher, and M2 chunk 2 is
 * the first caller.
 *
 * `"system"` tracks the OS appearance live rather than only at launch:
 * `useColorScheme()` itself re-renders this provider whenever the OS
 * setting changes (confirmed from React Native's own `Appearance`
 * subscription inside the hook), so no manual `Appearance.addChangeListener`
 * bookkeeping is needed here — the hook is just always called, and its
 * result is only *consulted* while `themeSetting === "system"`.
 *
 * Persistence lives in `SettingsContext`, not here — this provider always
 * boots at `DEFAULT_THEME_NAME` ("dark") on every launch regardless of
 * what was last chosen, and `SettingsProvider` (mounted as this
 * provider's child in `_layout.tsx`) applies the stored preference once
 * its own `AsyncStorage` read resolves. That keeps "dark is the default
 * default before Settings is ever opened" true independent of whichever
 * provider happens to hydrate first.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(DEFAULT_THEME_NAME);
  const osScheme = useColorScheme();

  // An unrecognized/unavailable OS scheme (`null`/`undefined`, e.g. an
  // older OS or a simulator quirk) falls back to dark, matching this
  // app's own default-default rather than silently going light.
  const resolvedThemeName: ThemeName =
    themeSetting === "system" ? (osScheme === "light" ? "light" : "dark") : themeSetting;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: nativeThemes[resolvedThemeName],
      themeName: resolvedThemeName,
      themeSetting,
      setThemeName: setThemeSetting,
    }),
    [resolvedThemeName, themeSetting]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): NativeTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be called within a <ThemeProvider>");
  return ctx.theme;
}

export function useThemeControls(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeControls() must be called within a <ThemeProvider>");
  return ctx;
}
