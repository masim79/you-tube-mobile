import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Playlist = components["schemas"]["Playlist"];
export type PlaylistPage = components["schemas"]["PlaylistPage"];
export type PlaylistItem = components["schemas"]["PlaylistItem"];
export type PlaylistItemPage = components["schemas"]["PlaylistItemPage"];
export type Visibility = components["schemas"]["Visibility"];

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

/**
 * Finds the caller's system playlist of the given kind (`watch_later` or
 * `liked` — each exists exactly once per user, created alongside the
 * channel, and cannot be created again) by paging through `GET /playlists`
 * until it's found. Added for M2 chunk 1's Watch Later/Liked screens, which
 * both need this same one-time lookup before they can list its items.
 */
export async function findSystemPlaylist(
  client: ApiClient,
  kind: "watch_later" | "liked"
): Promise<Playlist | null> {
  let cursor: string | null = null;
  // A handful of pages comfortably covers any realistic playlist count —
  // the two system playlists are created early (alongside the channel), so
  // in practice they're on the first page.
  for (let i = 0; i < 10; i += 1) {
    const page = await getPlaylists(client, { cursor, limit: 50 });
    const found = (page.items ?? []).find((p) => p.kind === kind);
    if (found) return found;
    if (!page.next_cursor) return null;
    cursor = page.next_cursor;
  }
  return null;
}

/** `GET /playlists/{id}` — anonymous-allowed, visibility-respecting read. */
export async function getPlaylist(client: ApiClient, id: string): Promise<Playlist> {
  return client.request<Playlist>(`/playlists/${id}`);
}

export interface CreatePlaylistParams {
  title: string;
  description?: string | null;
  visibility: Visibility;
}

/** `POST /playlists` — requires auth. Always creates a `normal`-kind playlist; `watch_later`/`liked` reject creation (exactly one each, made alongside the channel). */
export async function createPlaylist(client: ApiClient, params: CreatePlaylistParams): Promise<Playlist> {
  return client.request<Playlist>("/playlists", {
    method: "POST",
    body: {
      title: params.title,
      ...(params.description !== undefined ? { description: params.description } : {}),
      visibility: params.visibility,
    },
  });
}

export interface UpdatePlaylistParams {
  title?: string;
  description?: string | null;
  visibility?: Visibility;
}

/** `PATCH /playlists/{id}` — owner only. 422 if targeting a system playlist (watch_later/liked may not be renamed/re-visibilitied). */
export async function updatePlaylist(
  client: ApiClient,
  id: string,
  params: UpdatePlaylistParams
): Promise<Playlist> {
  return client.request<Playlist>(`/playlists/${id}`, {
    method: "PATCH",
    body: params,
  });
}

/** `DELETE /playlists/{id}` — owner only. 422 if targeting a system playlist (watch_later/liked may not be deleted). */
export async function deletePlaylist(client: ApiClient, id: string): Promise<void> {
  await client.request<void>(`/playlists/${id}`, { method: "DELETE" });
}

export interface PlaylistItemsParams {
  cursor?: string | null;
  limit?: number;
}

/** `GET /playlists/{id}/items` — anonymous-allowed, visibility-respecting, ordered by position. Each item embeds its full `video`, so no second fetch per item. */
export async function getPlaylistItems(
  client: ApiClient,
  playlistId: string,
  params: PlaylistItemsParams = {}
): Promise<PlaylistItemPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<PlaylistItemPage>(`/playlists/${playlistId}/items${qs ? `?${qs}` : ""}`);
}

/**
 * `POST /playlists/{id}/items` — owner only. 409 if the video is already in
 * the playlist. Rejects with 422 on the `liked` system playlist — its items
 * come from `POST /videos/{id}/reaction` instead (see `PlaylistItem`'s
 * contract note).
 */
export async function addPlaylistItem(client: ApiClient, playlistId: string, videoId: string): Promise<PlaylistItem> {
  return client.request<PlaylistItem>(`/playlists/${playlistId}/items`, {
    method: "POST",
    body: { video_id: videoId },
  });
}

/** `DELETE /playlists/{id}/items/{item_id}` — owner only. */
export async function removePlaylistItem(client: ApiClient, playlistId: string, itemId: string): Promise<void> {
  await client.request<void>(`/playlists/${playlistId}/items/${itemId}`, { method: "DELETE" });
}
