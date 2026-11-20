/**
 * Scoped, documented exception to PLAN.md §17.4/§10.2's "no literal hex in a
 * component" rule — player chrome (control icons/text, the fullscreen
 * letterbox fill, the seek-bar track) is conventionally **theme-independent**:
 * it looks the same dark-overlay-on-video regardless of whether the app
 * theme is light or dark, the same as every major video player including
 * YouTube's own. `tokens.generated.ts` (generated from
 * `vendor/you-tube/frontend/src/styles/themes/*.css`) has no
 * "always black"/"always white" token for this, because the web player has
 * the same property — its own chrome is hard-coded dark-on-video in CSS,
 * not theme-tokened either, since it isn't meant to flip with the site
 * theme. Reusing an existing token here (e.g. `theme.colors.bg`, which
 * flips white in the light theme, or `theme.colors.accentContrast`, which
 * means "text on the accent color," not "video chrome text") would be a
 * semantic mismatch, not a fix — so this is a dedicated, named, commented
 * constant instead of bare hex scattered across call sites, and instead of
 * a token-name reuse that would be wrong in the light theme.
 *
 * Used only inside `src/player/` — anywhere else in the app, the no-hex
 * rule applies with no exception; use `useTheme()` there as normal.
 */
export const PLAYER_CHROME = {
  /** Control icon/text color over the video surface. */
  text: "#ffffff",
  /** Fullscreen letterbox fill / player surface background. */
  background: "#000000",
  /** Un-filled seek-bar track. */
  trackBackground: "rgba(255, 255, 255, 0.35)",
  /** Backdrop scrim behind the quality/speed option sheets. */
  sheetBackdrop: "rgba(0, 0, 0, 0.4)",
} as const;
