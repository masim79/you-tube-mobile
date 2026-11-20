import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Playlist = components["schemas"]["Playlist"];
export type PlaylistPage = components["schemas"]["PlaylistPage"];

export interface PlaylistsParams {
  cursor?: string | null;
  limit?: number;
}

/** `GET /playlists` — requires auth. The caller's own playlists, including the two system ones (`watch_later`, `liked`). */
export async function getPlaylists(client: ApiClient, params: PlaylistsParams = {}): Promise<PlaylistPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<PlaylistPage>(`/playlists${qs ? `?${qs}` : ""}`);
}
