/**
 * Mirrors the web's `vendor/you-tube/frontend/src/app/pages/upload/upload-constants.ts`
 * (M1 chunk 7). There is no public config-read endpoint for `MAX_UPLOAD_GB`
 * (PLAN.md §8 doesn't expose one), so — exactly like the web — this guard
 * uses the server's `.env.example` default. If a deployment changes
 * `MAX_UPLOAD_GB`, the server-side `pre-create` hook (§20.5) is still the
 * authority: a mismatch here only means this client-side guard fires a
 * little early or late, never a security boundary.
 */
export const MAX_UPLOAD_GB = 4;
export const BYTES_PER_GB = 1024 ** 3;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_GB * BYTES_PER_GB;
