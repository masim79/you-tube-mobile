/**
 * Mirrors `vendor/you-tube/frontend/src/app/shared/player/quality-options.ts`
 * exactly (same ids/labels/steps) so the quality and speed pickers behave
 * identically on both clients — reimplemented rather than imported since
 * there's no path from the submodule's Angular-adjacent TS into this app.
 */

/** `'auto'` or a rendition height in pixels (360, 720, 1080, …). */
export type QualityId = "auto" | number;

export interface QualityOption {
  readonly id: QualityId;
  readonly label: string;
}

/** Fixed playback-speed steps, in order, for the speed menu. */
export const PLAYBACK_RATE_STEPS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Builds the Auto + per-rendition quality list from `Video.qualities` (a set of rendition heights). */
export function qualityOptionsFromHeights(heights: readonly number[]): QualityOption[] {
  const unique = [...new Set(heights.filter((h) => h > 0))].sort((a, b) => b - a);
  return [{ id: "auto", label: "Auto" }, ...unique.map((height) => ({ id: height, label: `${height}p` }))];
}
