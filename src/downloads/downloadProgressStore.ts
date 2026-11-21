import { useEffect, useState } from "react";

import type { DownloadProgressState } from "./types";

/**
 * A plain module-level pub/sub for one video's in-flight download progress
 * — deliberately *not* a React Context (unlike `miniPlayerStore.tsx`'s
 * `MiniPlayerProvider`): nothing here needs a single app-wide instance
 * mounted at the root, and skipping the provider means this chunk touches
 * no file under `src/app/_layout.tsx`. Any component (`DownloadButton`,
 * the Downloads library screen) can read/subscribe directly by `videoId`.
 *
 * In-memory only, same scope as `types.ts`'s `DownloadProgressState` doc
 * comment — a killed app has nothing to report back to on relaunch, and
 * `downloadManager.ts` doesn't try to resume anything automatically.
 */

type Listener = (state: DownloadProgressState | null) => void;

const progressByVideoId = new Map<string, DownloadProgressState>();
const listenersByVideoId = new Map<string, Set<Listener>>();

export function getDownloadProgress(videoId: string): DownloadProgressState | null {
  return progressByVideoId.get(videoId) ?? null;
}

export function setDownloadProgress(videoId: string, next: DownloadProgressState | null): void {
  if (next) {
    progressByVideoId.set(videoId, next);
  } else {
    progressByVideoId.delete(videoId);
  }
  const listeners = listenersByVideoId.get(videoId);
  if (!listeners) return;
  for (const listener of listeners) listener(next);
}

export function subscribeDownloadProgress(videoId: string, listener: Listener): () => void {
  let listeners = listenersByVideoId.get(videoId);
  if (!listeners) {
    listeners = new Set();
    listenersByVideoId.set(videoId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
  };
}

/** Reactive read of one video's live download progress — `null` when nothing is in flight for it. */
export function useDownloadProgress(videoId: string | null | undefined): DownloadProgressState | null {
  const [state, setState] = useState<DownloadProgressState | null>(videoId ? getDownloadProgress(videoId) : null);

  useEffect(() => {
    if (!videoId) {
      setState(null);
      return;
    }
    setState(getDownloadProgress(videoId));
    return subscribeDownloadProgress(videoId, setState);
  }, [videoId]);

  return state;
}
