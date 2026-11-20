import Constants from "expo-constants";

/**
 * This app's own version — sourced from `app.config.ts`'s `version` field
 * via `expo-constants` rather than duplicated as a second literal. Falls
 * back to `"0.0.0"` only if `expoConfig` is ever unavailable (it always
 * is at runtime; the fallback exists for type safety, not expected use).
 *
 * Compared against the server's `min_client_version_mobile`
 * (`GET /api/server/info`, PLAN.md §17.5) on every launch — an app older
 * than that shows a blocking "update required" screen, since there is no
 * way to force-refresh someone's phone.
 */
export const CLIENT_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

/**
 * `X-Client` header value (§20.1, §20.2). The server matches on the
 * `hometube-mobile` prefix (`backend/app/routers/auth.py`'s
 * `MOBILE_CLIENT_PREFIX`) to decide whether to return the refresh token
 * in the response body instead of an httpOnly cookie.
 */
export const X_CLIENT_HEADER = `hometube-mobile/${CLIENT_VERSION}`;

/**
 * Compares two dotted version strings numerically, segment by segment
 * (`"1.10.0"` > `"1.9.0"`, which a plain string comparison would get
 * backwards). Missing trailing segments compare as `0`
 * (`"1.2"` === `"1.2.0"`).
 *
 * Returns negative/zero/positive, the same convention as `Array.sort`'s
 * comparator.
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const partsB = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when `current` is older than `minimum` (strictly less than). */
export function isVersionBelow(current: string, minimum: string): boolean {
  return compareVersions(current, minimum) < 0;
}
