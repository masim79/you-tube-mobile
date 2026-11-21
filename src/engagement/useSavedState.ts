import { useState } from "react";

import { addToWatchLater, removeFromWatchLater } from "../api/videos";
import { useApiClient } from "../api/useApiClient";

export interface UseSavedStateResult {
  isSaved: boolean;
  savePending: boolean;
  toggleSave: () => Promise<void>;
}

/**
 * Watch-later save/unsave against `POST`/`DELETE /videos/{id}/watch-later`
 * — extracted out of `ActionPills` (M1 chunk 6) for the same reason
 * `useVideoReaction` was (see that file's doc comment): M4 chunk 1's
 * Shorts action rail reuses this exact call rather than a second copy.
 */
export function useSavedState(
  videoId: string | null | undefined,
  isAuthenticated: boolean,
  onRequireAuth: () => void
): UseSavedStateResult {
  const client = useApiClient();
  const [isSaved, setIsSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);

  async function toggleSave(): Promise<void> {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    if (!videoId || savePending) return;
    const next = !isSaved;
    setIsSaved(next);
    setSavePending(true);
    try {
      if (next) {
        await addToWatchLater(client, videoId);
      } else {
        await removeFromWatchLater(client, videoId);
      }
    } catch {
      setIsSaved(!next);
    } finally {
      setSavePending(false);
    }
  }

  return { isSaved, savePending, toggleSave };
}
