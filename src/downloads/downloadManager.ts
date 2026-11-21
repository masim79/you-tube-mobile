import { Directory, File, Paths } from "expo-file-system";

import type { ApiClient } from "../api/useApiClient";
import { getDownloadOptions, requestDownload, type DownloadOptions, type Video } from "../api/videos";
import { resolveMediaUrl } from "../ui/format";
import {
  dismissDownloadNotification,
  requestDownloadNotificationPermission,
  showDownloadDoneNotification,
  showDownloadProgressNotification,
} from "./downloadNotifications";
import { setDownloadProgress } from "./downloadProgressStore";
import { upsertDownload } from "./downloadRegistry";
import type { DownloadEntry } from "./types";

export { getDownloadOptions };
export type { DownloadOptions };

const DOWNLOADS_DIR_NAME = "downloads";
const THUMBS_DIR_NAME = "download-thumbs";

/** `POST /videos/{id}/download`'s own description says the client polls while `status: "preparing"` — bounded so a stuck server-side job can't poll forever. ~100 * 3s = 5 minutes, comfortably inside the 10-minute `SIGNED_URL_TTL_MIN` budget the signed link gets once it *is* ready. */
const PREPARE_POLL_INTERVAL_MS = 3000;
const MAX_PREPARE_POLLS = 100;

/** Whole-file retry attempts on a dropped connection — see this module's header comment for why this, not byte-range resume. */
const MAX_DOWNLOAD_ATTEMPTS = 3;

function documentSubdirectory(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** Keeps generated filenames filesystem-safe — video ids are UUIDs and quality ids are short alphanumeric strings in practice, but this is cheap insurance either way. */
function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DownloadFailedError extends Error {}

export interface StartDownloadParams {
  client: ApiClient;
  video: Video;
  /** One of `DownloadOptions.qualities[].quality` (e.g. `"720"`, `"360"`, `"audio"`). */
  quality: string;
}

/**
 * Orchestrates one video's offline download end to end (PLAN.md §17.1,
 * M2 chunk 4): request -> poll while preparing -> fetch bytes into the
 * app's **documents** directory (never cache — §17.7's own risk table:
 * "the OS reclaims the app's cache directory") -> register it in the
 * on-device library (`downloadRegistry.ts`) -> report through
 * `downloadProgressStore.ts` and a progress notification
 * (`downloadNotifications.ts`, same pattern as `uploadNotifications.ts`).
 *
 * **Resumability, scoped honestly.** The task's backend fix makes
 * `GET /downloads/{token}` repeatable within its ~10-minute TTL, so a
 * dropped connection mid-transfer is handled here by retrying the *entire*
 * file fetch against the *same* signed link (up to `MAX_DOWNLOAD_ATTEMPTS`
 * times), not true byte-range resume. `expo-file-system`'s new
 * `DownloadTask` *does* expose OS-level pause/resume
 * (`pauseAsync`/`resumeAsync`, backed by native resume data) — not used
 * here because, per that class's own doc comments, the resume data (and
 * the whole `DownloadTask` JS instance) is lost if the app process is
 * terminated, so it buys nothing extra over a whole-file retry for the
 * common "network blipped, app still running" case this is built for, and
 * costs real complexity (persisting `savable()` state, restoring it at the
 * right moment) for a device-killed-mid-transfer case this chunk doesn't
 * attempt to survive either way. A later chunk could upgrade to it without
 * changing this function's signature — documented rather than silently
 * built short.
 *
 * **Not implemented, by the same honesty rule**: cancelling an in-flight
 * download (no UI/API for it below — the only way to stop one today is to
 * background/kill the app), and resuming a download that was in flight
 * when the app was killed (next launch simply has no record of it, since
 * `downloadProgressStore.ts` is in-memory only).
 */
export async function startDownload({ client, video, quality }: StartDownloadParams): Promise<DownloadEntry> {
  const videoId = video.id;
  if (!videoId) throw new DownloadFailedError("Video has no id");
  const title = video.title ?? "Video";

  void requestDownloadNotificationPermission();
  setDownloadProgress(videoId, { phase: "requesting", progress: null });
  await showDownloadProgressNotification(title, 0);

  try {
    const url = await resolveDownloadUrl(client, videoId, quality);

    setDownloadProgress(videoId, { phase: "downloading", progress: 0 });
    const destination = new File(
      documentSubdirectory(DOWNLOADS_DIR_NAME),
      `${sanitizeForFilename(videoId)}_${sanitizeForFilename(quality)}.mp4`
    );

    const downloadedFile = await downloadWithRetry(url, destination, (fraction) => {
      setDownloadProgress(videoId, { phase: "downloading", progress: fraction });
      void showDownloadProgressNotification(title, fraction * 100);
    });

    const localThumbnailPath = await cacheThumbnailBestEffort(client, video);

    const entry: DownloadEntry = {
      videoId,
      title,
      channelName: video.channel_name ?? null,
      localThumbnailPath,
      quality,
      localPath: downloadedFile.uri,
      sizeBytes: downloadedFile.exists ? downloadedFile.size : 0,
      downloadedAt: new Date().toISOString(),
    };

    await upsertDownload(entry);
    setDownloadProgress(videoId, { phase: "done", progress: 1 });
    await showDownloadDoneNotification(title, true);
    return entry;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    setDownloadProgress(videoId, { phase: "error", progress: null, error: message });
    await showDownloadDoneNotification(title, false);
    throw error instanceof Error ? error : new DownloadFailedError(message);
  }
}

/** Clears a finished/failed download's live progress entry — call once the caller's UI has reacted to the terminal state (e.g. after showing a toast), so a later re-download of the same video starts from a clean slate rather than showing a stale `"done"`/`"error"`. */
export function clearDownloadProgress(videoId: string): void {
  setDownloadProgress(videoId, null);
  void dismissDownloadNotification();
}

/** `POST /videos/{id}/download`, polling on `status: "preparing"` per the contract's own description (see `MAX_PREPARE_POLLS`'s doc comment). */
async function resolveDownloadUrl(client: ApiClient, videoId: string, quality: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_PREPARE_POLLS; attempt++) {
    const result = await requestDownload(client, videoId, quality);
    if (result.status === "ready" && result.url) {
      return result.url;
    }
    setDownloadProgress(videoId, { phase: "preparing", progress: null });
    await delay(PREPARE_POLL_INTERVAL_MS);
  }
  throw new DownloadFailedError("Timed out waiting for the download to be prepared.");
}

/**
 * Fetches `url` (the server's absolute, signed `/api/downloads/{token}`
 * link — `security: []`, no bearer header needed) straight to `destination`
 * via `expo-file-system`'s promise-based `File.downloadFileAsync`, the
 * simpler of its two download APIs (no manual task/state juggling) — a
 * deliberate fit for "a plain HTTP GET… is simpler than the resumable-
 * upload problem" per the task brief. `idempotent: true` lets a retry
 * overwrite the same partially-written destination file rather than
 * rejecting with `DestinationAlreadyExists`.
 */
async function downloadWithRetry(
  url: string,
  destination: File,
  onProgress: (fraction: number) => void
): Promise<File> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      return await File.downloadFileAsync(url, destination, {
        idempotent: true,
        onProgress: ({ bytesWritten, totalBytes }) => {
          if (totalBytes > 0) onProgress(Math.min(1, bytesWritten / totalBytes));
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt < MAX_DOWNLOAD_ATTEMPTS) {
        await delay(1000 * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new DownloadFailedError("Download failed");
}

/** Never blocks or fails the actual media download — a missing/failed thumbnail cache just means the library row falls back to no image, same as `VideoCard`'s own handling of a `null` thumbnail URL. */
async function cacheThumbnailBestEffort(client: ApiClient, video: Video): Promise<string | null> {
  const videoId = video.id;
  const remoteUrl = resolveMediaUrl(client.baseUrl, video.thumbnail_path);
  if (!videoId || !remoteUrl) return null;
  try {
    const destination = new File(documentSubdirectory(THUMBS_DIR_NAME), `${sanitizeForFilename(videoId)}.jpg`);
    const file = await File.downloadFileAsync(remoteUrl, destination, { idempotent: true });
    return file.uri;
  } catch {
    return null;
  }
}
