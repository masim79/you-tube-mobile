import { dark, light, type ThemeName, type ThemeTokens } from "./tokens.generated";

export type { ThemeName };

/** Strips a trailing CSS unit (`"12px"` -> `12`) for React Native's unitless layout numbers. */
function toNumber(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Takes the first name out of a CSS font stack (`"'Roboto', 'Arial',
 * sans-serif"` -> `"Roboto"`) — React Native's `fontFamily` takes one
 * name, not a fallback list, and doesn't understand quoting. An
 * unresolvable name falls back to the platform default silently rather
 * than crashing, so this is safe even where the named font isn't bundled.
 */
function firstFontFamily(cssFontStack: string): string {
  const first = cssFontStack.split(",")[0] ?? cssFontStack;
  return first.trim().replace(/^['"]|['"]$/g, "");
}

export interface NativeTheme {
  name: ThemeName;
  colors: {
    accent: string;
    accentContrast: string;
    bg: string;
    surface: string;
    surfaceRaised: string;
    surfaceHover: string;
    border: string;
    text: string;
    textSecondary: string;
    link: string;
  };
  radius: { sm: number; md: number; pill: number };
  spacing: { 1: number; 2: number; 3: number; 4: number; 6: number };
  fontSize: { xs: number; sm: number; md: number; lg: number; xl: number };
  fontFamily: string;
}

function toNativeTheme(name: ThemeName, tokens: ThemeTokens): NativeTheme {
  return {
    name,
    colors: {
      accent: tokens.colorAccent,
      accentContrast: tokens.colorAccentContrast,
      bg: tokens.colorBg,
      surface: tokens.colorSurface,
      surfaceRaised: tokens.colorSurfaceRaised,
      surfaceHover: tokens.colorSurfaceHover,
      border: tokens.colorBorder,
      text: tokens.colorText,
      textSecondary: tokens.colorTextSecondary,
      link: tokens.colorLink,
    },
    radius: {
      sm: toNumber(tokens.radiusSm),
      md: toNumber(tokens.radiusMd),
      // Pill radius is deliberately not clamped to the CSS's 9999px —
      // RN just needs "large enough to always round a pill-shaped
      // element fully", which any large constant achieves.
      pill: 999,
    },
    spacing: {
      1: toNumber(tokens.space1),
      2: toNumber(tokens.space2),
      3: toNumber(tokens.space3),
      4: toNumber(tokens.space4),
      6: toNumber(tokens.space6),
    },
    fontSize: {
      xs: toNumber(tokens.textXs),
      sm: toNumber(tokens.textSm),
      md: toNumber(tokens.textMd),
      lg: toNumber(tokens.textLg),
      xl: toNumber(tokens.textXl),
    },
    fontFamily: firstFontFamily(tokens.fontSans),
  };
}

export const nativeThemes: Record<ThemeName, NativeTheme> = {
  dark: toNativeTheme("dark", dark),
  light: toNativeTheme("light", light),
};

/** Dark is the mobile default (PLAN.md §17.4, §19.3), unlike the web. */
export const DEFAULT_THEME_NAME: ThemeName = "dark";
