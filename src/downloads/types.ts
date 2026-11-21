/**
 * Shared shapes for the Offline downloads feature (PLAN.md §17.1's row:
 * "Download with a quality choice, a Downloads library, expiry and
 * re-validation, delete, download-over-Wi-Fi-only, storage usage", M2
 * chunk 4). Deliberately separate from `src/api/videos.ts`'s
 * `DownloadOptions`/`DownloadRequestResult` — those describe the server's
 * download-request flow; everything here describes what is actually on
 * this device, which is a different, local-only concept (see
 * `downloadRegistry.ts`'s header comment).
 */

/**
 * One entry in the on-device Downloads library, persisted via
 * `downloadRegistry.ts`. Keyed by `videoId` alone — downloading a new
 * quality for a video that already has a local copy replaces it rather
 * than keeping both, the same one-local-copy-per-video simplification the
 * YouTube app itself effectively enforces (it doesn't let you keep two
 * qualities of one video offline at once either). Documented rather than
 * silently assumed.
 */
export interface DownloadEntry {
  videoId: string;
  title: string;
  channelName: string | null;
  /** A local `file://` copy of the thumbnail, cached best-effort at download time so the library screen can render something fully offline. `null` if that best-effort cache attempt failed — never blocks the actual media download. */
  localThumbnailPath: string | null;
  /** Opaque quality id as sent to/from the server — e.g. `"720"`, `"360"`, `"audio"` (matches `DownloadOptions.qualities[].quality`). */
  quality: string;
  /** `file://` URI of the downloaded media file, in the app's documents directory (never cache — §17.7). */
  localPath: string;
  sizeBytes: number;
  /** ISO 8601, when the download completed. */
  downloadedAt: string;
}

export type DownloadPhase = "requesting" | "preparing" | "downloading" | "done" | "error";

/** Live, in-memory-only progress for one video's in-flight download — see `downloadProgressStore.ts`. Never persisted; a killed/restarted app has no in-flight downloads to resume, same honest gap `downloadManager.ts`'s header comment documents. */
export interface DownloadProgressState {
  phase: DownloadPhase;
  /** 0..1, or `null` while indeterminate (`requesting`/`preparing`, or `error`). */
  progress: number | null;
  error?: string;
}
