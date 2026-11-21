import { useState } from "react";

import { postReaction, type Video } from "../api/videos";
import { useApiClient } from "../api/useApiClient";

export type Reaction = 1 | -1 | 0;

/** Signed change in a reaction's count bucket as `yourValue` moves from `from` to `to` — same arithmetic as the web's `action-pills.ts`. */
function reactionDelta(from: Reaction, to: Reaction, bucket: 1 | -1): number {
  const was = from === bucket ? 1 : 0;
  const is = to === bucket ? 1 : 0;
  return is - was;
}

export interface UseVideoReactionResult {
  likeCount: number;
  dislikeCount: number;
  yourReaction: Reaction;
  react: (value: Reaction) => Promise<void>;
}

/**
 * Like/dislike optimistic-update-with-silent-rollback state against
 * `POST /videos/{id}/reaction` (PLAN.md §20.1: the endpoint is idempotent,
 * so a failed request just reverts local counts rather than surfacing an
 * error). Extracted out of `ActionPills` (M1 chunk 6) during M4 chunk 1 so
 * the Shorts feed's vertical action rail (`shorts/ShortsActionRail.tsx`)
 * can drive the exact same call without a second copy of this arithmetic —
 * `ActionPills` itself was refactored to call this hook instead of owning
 * the logic directly, with no behavior change.
 *
 * Seeded once from `video` at the call site — give the *caller* a
 * `key={video.id}` (same convention `ActionPills`/`VideoPlayer` already
 * use) since this hook does not re-sync if handed a different `video`
 * without being remounted.
 */
export function useVideoReaction(
  video: Pick<Video, "id" | "like_count" | "dislike_count" | "your_reaction">,
  isAuthenticated: boolean,
  onRequireAuth: () => void
): UseVideoReactionResult {
  const client = useApiClient();
  const [likeCount, setLikeCount] = useState(video.like_count ?? 0);
  const [dislikeCount, setDislikeCount] = useState(video.dislike_count ?? 0);
  const [yourReaction, setYourReaction] = useState<Reaction>((video.your_reaction ?? 0) as Reaction);

  async function react(value: Reaction): Promise<void> {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const videoId = video.id;
    if (!videoId) return;

    const previousReaction = yourReaction;
    const previousLikes = likeCount;
    const previousDislikes = dislikeCount;
    const nextReaction: Reaction = previousReaction === value ? 0 : value;

    setYourReaction(nextReaction);
    setLikeCount(previousLikes + reactionDelta(previousReaction, nextReaction, 1));
    setDislikeCount(previousDislikes + reactionDelta(previousReaction, nextReaction, -1));

    try {
      const result = await postReaction(client, videoId, nextReaction);
      setLikeCount(result.like_count ?? previousLikes);
      setDislikeCount(result.dislike_count ?? previousDislikes);
      setYourReaction((result.your_value ?? nextReaction) as Reaction);
    } catch {
      // Silent rollback — same idempotent-endpoint convention as the web.
      setYourReaction(previousReaction);
      setLikeCount(previousLikes);
      setDislikeCount(previousDislikes);
    }
  }

  return { likeCount, dislikeCount, yourReaction, react };
}
