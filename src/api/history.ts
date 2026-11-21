import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type HistoryEntry = components["schemas"]["HistoryEntry"];
export type HistoryPage = components["schemas"]["HistoryPage"];

export interface WatchHistoryParams {
  cursor?: string | null;
  limit?: number;
}

/** `GET /me/history` — requires auth. Newest first, keyset-paginated. */
export async function getWatchHistory(client: ApiClient, params: WatchHistoryParams = {}): Promise<HistoryPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<HistoryPage>(`/me/history${qs ? `?${qs}` : ""}`);
}

/** `DELETE /me/history` — requires auth. Clears all of the caller's history; irreversible, callers should confirm first. */
export async function clearWatchHistory(client: ApiClient): Promise<void> {
  await client.request<void>("/me/history", { method: "DELETE" });
}

/** `DELETE /me/history/{entry_id}` — requires auth. Removes one entry. */
export async function deleteWatchHistoryEntry(client: ApiClient, entryId: string): Promise<void> {
  await client.request<void>(`/me/history/${entryId}`, { method: "DELETE" });
}
