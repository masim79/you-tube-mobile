/**
 * Small presentational helpers shared by `ui/` components (no HTTP, no
 * state) — the mobile equivalent of the web's
 * `vendor/you-tube/frontend/src/app/ui/format/format.ts` (§10.3's
 * "relative times… and compact numbers" / duration badge), reimplemented
 * here in plain TS since there is no path to import Angular-adjacent code
 * from the submodule into React Native.
 */

/** "1.2K", "3.4M" — compact counts, matching §10.3 ("1.2K views"). */
export function formatCompactNumber(value: number): string {
  if (value < 1000) return `${value}`;
  const units: [number, string][] = [
    [1_000_000_000, "B"],
    [1_000_000, "M"],
    [1_000, "K"],
  ];
  for (const [threshold, suffix] of units) {
    if (value >= threshold) {
      const scaled = value / threshold;
      const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
      return `${rounded}${suffix}`;
    }
  }
  return `${value}`;
}

/** "3 days ago", "just now" — relative time, matching §10.3. */
export function formatRelativeTime(from: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  const steps: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let unitValue = seconds;
  let unitName = "second";
  for (const [size, name] of steps) {
    if (unitValue < size) {
      unitName = name;
      break;
    }
    unitValue = Math.floor(unitValue / size);
    unitName = name;
  }

  if (unitName === "second" && unitValue < 10) return "just now";
  const rounded = Math.max(1, Math.floor(unitValue));
  return `${rounded} ${unitName}${rounded === 1 ? "" : "s"} ago`;
}

/** "12:34" / "1:02:03" — duration badge on a thumbnail. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "812 MB", "1.3 GB" — binary-ish human file sizes, matching the web's
 * `pages/upload/upload-constants.ts` `formatFileSize` (upload progress UI, M1 chunk 7). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

/**
 * Resolves a server-relative media path (`thumbnail_path`,
 * `channel_avatar_path` — never under `/api`, served straight from disk
 * by nginx per PLAN.md's architecture diagram) against the app's current
 * `baseUrl`. Returns `null` unchanged so callers can fall back to a
 * placeholder without string-checking first.
 */
export function resolveMediaUrl(baseUrl: string | null, path: string | null | undefined): string | null {
  if (!path) return null;
  if (!baseUrl) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
