import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Chapter = components["schemas"]["Chapter"];

/**
 * `GET /videos/{id}/chapters` (`getChapters`) — public, ordered list.
 * Owner-only editing (`PUT /videos/{id}/chapters`) is out of scope for this
 * mobile phase (PLAN.md §17.1 "chapter list and seek-by-chapter", M3
 * chunk 2).
 */
export async function getChapters(client: ApiClient, videoId: string): Promise<Chapter[]> {
  return client.request<Chapter[]>(`/videos/${videoId}/chapters`);
}
