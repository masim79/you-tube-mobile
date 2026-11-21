import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";

import type { DownloadEntry } from "./types";

/**
 * The on-device Downloads *library* — what is actually downloaded to this
 * phone (PLAN.md §17.1, M2 chunk 4). This is **not** the server's
 * `GET /me/downloads` (`listMyDownloads`, `src/api/...` has no wrapper for
 * it on purpose) — that's the caller's server-side download-*request*
 * history log, which could include requests made from another device, or
 * exclude a file this device still has locally if it was deleted
 * server-side. The two have no required relationship, so this registry is
 * the only source of truth the Downloads library screen reads from.
 *
 * Plain `AsyncStorage`, same tier as `recentSearches.ts` and
 * `SettingsContext.tsx` — a list of already-public video ids/titles/local
 * file paths, nothing sensitive, no keychain needed.
 */
const STORAGE_KEY = "ht_downloads";

async function readAll(): Promise<DownloadEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DownloadEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: DownloadEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Best-effort local file deletion — never throws, since the registry row is the thing that must be removed regardless of whether the file is still there to delete. */
function deleteLocalFilesBestEffort(entry: DownloadEntry): void {
  try {
    const media = new File(entry.localPath);
    if (media.exists) media.delete();
  } catch {
    // Already gone, or unreadable — nothing more to do.
  }
  if (entry.localThumbnailPath) {
    try {
      const thumb = new File(entry.localThumbnailPath);
      if (thumb.exists) thumb.delete();
    } catch {
      // Same as above.
    }
  }
}

export async function getDownloads(): Promise<DownloadEntry[]> {
  return readAll();
}

export async function getDownloadForVideo(videoId: string): Promise<DownloadEntry | null> {
  const entries = await readAll();
  return entries.find((entry) => entry.videoId === videoId) ?? null;
}

/** Replaces any existing entry for the same `videoId` (see `types.ts`'s doc comment on the one-copy-per-video simplification) and deletes that previous entry's files, since it's about to become unreferenced. */
export async function upsertDownload(entry: DownloadEntry): Promise<DownloadEntry[]> {
  const existing = await readAll();
  const previous = existing.find((item) => item.videoId === entry.videoId);
  if (previous && previous.localPath !== entry.localPath) {
    deleteLocalFilesBestEffort(previous);
  }
  const next = [entry, ...existing.filter((item) => item.videoId !== entry.videoId)];
  await writeAll(next);
  return next;
}

export async function removeDownload(videoId: string): Promise<DownloadEntry[]> {
  const existing = await readAll();
  const toRemove = existing.find((item) => item.videoId === videoId);
  const next = existing.filter((item) => item.videoId !== videoId);
  await writeAll(next);
  if (toRemove) deleteLocalFilesBestEffort(toRemove);
  return next;
}

export async function clearAllDownloads(): Promise<void> {
  const existing = await readAll();
  for (const entry of existing) deleteLocalFilesBestEffort(entry);
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function totalDownloadBytes(): Promise<number> {
  const entries = await readAll();
  return entries.reduce((sum, entry) => sum + (entry.sizeBytes || 0), 0);
}

/**
 * Expiry/re-validation (§17.1), scoped honestly to what a local file
 * actually can mean "expired": confirms each entry's media file still
 * exists on disk (`expo-file-system`'s synchronous `File.exists`), pruning
 * any that don't — the OS reclaimed storage unexpectedly despite living in
 * the documents directory, or the user cleared app data. Never re-fetches
 * from the server; a pruned entry's video should surface in the library UI
 * as "no longer available, re-download" (the caller's job, not this
 * function's). Persists the prune so repeated calls (library screen open,
 * app launch) don't redo it until something changes again.
 */
export async function validateDownloads(): Promise<DownloadEntry[]> {
  const existing = await readAll();
  const valid: DownloadEntry[] = [];
  let changed = false;
  for (const entry of existing) {
    let exists = false;
    try {
      exists = new File(entry.localPath).exists;
    } catch {
      exists = false;
    }
    if (exists) {
      valid.push(entry);
    } else {
      changed = true;
    }
  }
  if (changed) await writeAll(valid);
  return valid;
}
