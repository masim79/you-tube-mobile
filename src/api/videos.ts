import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Video = components["schemas"]["Video"];
export type VideoPage = components["schemas"]["VideoPage"];

/** `GET /videos/{id}` — anonymous-allowed (private/unlisted visibility is still enforced server-side per the caller's bearer token, PLAN.md §13). */
export async function getVideo(client: ApiClient, id: string): Promise<Video> {
  return client.request<Video>(`/videos/${id}`);
}

export interface RelatedVideosParams {
  cursor?: string | null;
  limit?: number;
}

/** `GET /videos/{id}/related` — anonymous-allowed, keyset-paginated. */
export async function getRelatedVideos(
  client: ApiClient,
  id: string,
  params: RelatedVideosParams = {}
): Promise<VideoPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<VideoPage>(`/videos/${id}/related${qs ? `?${qs}` : ""}`);
}

export interface ReactionResult {
  like_count?: number;
  dislike_count?: number;
  your_value?: 1 | -1 | 0;
}

/** `POST /videos/{id}/reaction` — idempotent upsert; `value: 0` clears the caller's reaction. Requires auth. */
export async function postReaction(
  client: ApiClient,
  id: string,
  value: 1 | -1 | 0
): Promise<ReactionResult> {
  return client.request<ReactionResult>(`/videos/${id}/reaction`, {
    method: "POST",
    body: { value },
  });
}

/** `PUT /videos/{id}/progress` — idempotent resume-position save. Requires auth. */
export async function updateProgress(client: ApiClient, id: string, positionS: number): Promise<void> {
  await client.request<void>(`/videos/${id}/progress`, {
    method: "PUT",
    body: { position_s: Math.max(0, Math.floor(positionS)) },
  });
}

export interface RecordViewParams {
  watchedS: number;
  sessionId: string;
  source?: "home" | "search" | "channel" | "related" | "external";
  maxPositionPct?: number | null;
}

/** `POST /videos/{id}/view` — heartbeat; anonymous-allowed, counted once per session server-side. */
export async function recordView(client: ApiClient, id: string, params: RecordViewParams): Promise<void> {
  await client.request<void>(`/videos/${id}/view`, {
    method: "POST",
    body: {
      watched_s: Math.max(0, Math.floor(params.watchedS)),
      session_id: params.sessionId,
      ...(params.source ? { source: params.source } : {}),
      ...(params.maxPositionPct != null ? { max_position_pct: params.maxPositionPct } : {}),
    },
  });
}

/** `POST /videos/{id}/watch-later` — adds to the caller's system `watch_later` playlist. Requires auth. */
export async function addToWatchLater(client: ApiClient, id: string): Promise<void> {
  await client.request<void>(`/videos/${id}/watch-later`, { method: "POST" });
}

/** `DELETE /videos/{id}/watch-later` — no-op (still 204) if it wasn't in the list. Requires auth. */
export async function removeFromWatchLater(client: ApiClient, id: string): Promise<void> {
  await client.request<void>(`/videos/${id}/watch-later`, { method: "DELETE" });
}
