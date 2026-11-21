import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Caption = components["schemas"]["Caption"];

/**
 * `GET /videos/{id}/captions` (`listCaptions`) — public, same visibility
 * rule as the video itself. Viewer-side playback only (PLAN.md §17.1
 * "Captions toggle with styling", M3 chunk 2) — upload/auto-generate/delete
 * (`POST /videos/{id}/captions`, `POST .../captions/auto`,
 * `DELETE .../captions/{caption_id}`) are creator tooling, out of scope for
 * this mobile phase. Callers should only render tracks where
 * `status === "ready"` and `path` is set — `pending`/`failed` tracks have
 * nothing to fetch yet.
 */
export async function getCaptions(client: ApiClient, videoId: string): Promise<Caption[]> {
  return client.request<Caption[]>(`/videos/${videoId}/captions`);
}
