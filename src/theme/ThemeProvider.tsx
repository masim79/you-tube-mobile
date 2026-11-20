import React, { createContext, useContext, useMemo, useState } from "react";

import { DEFAULT_THEME_NAME, nativeThemes, type NativeTheme, type ThemeName } from "./index";

interface ThemeContextValue {
  theme: NativeTheme;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Dark-by-default theme context (PLAN.md §17.4/§19.3). `setThemeName` is
 * exposed now so M2's settings screen (light/dark/system) has something
 * to call into — M0 itself never shows a theme switcher.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME_NAME);
  const value = useMemo<ThemeContextValue>(
    () => ({ theme: nativeThemes[themeName], themeName, setThemeName }),
    [themeName]
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
