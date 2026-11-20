import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Channel = components["schemas"]["Channel"];
export type VideoPage = components["schemas"]["VideoPage"];

/** `GET /channels/{handle}` — anonymous-allowed. `Channel.is_subscribed` is `null` when unauthenticated, otherwise the caller's own subscribe state — there is no separate "is subscribed" endpoint, so that field is the only source for it. */
export async function getChannel(client: ApiClient, handle: string): Promise<Channel> {
  return client.request<Channel>(`/channels/${encodeURIComponent(handle)}`);
}

export interface ChannelVideosParams {
  cursor?: string | null;
  limit?: number;
}

/** `GET /channels/{handle}/videos` — a page of the channel's public videos, keyset-paginated. */
export async function getChannelVideos(
  client: ApiClient,
  handle: string,
  params: ChannelVideosParams = {}
): Promise<VideoPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<VideoPage>(`/channels/${encodeURIComponent(handle)}/videos${qs ? `?${qs}` : ""}`);
}

/** `POST /channels/{id}/subscribe` — idempotent, 204, requires auth. */
export async function subscribeToChannel(client: ApiClient, channelId: string): Promise<void> {
  await client.request<void>(`/channels/${channelId}/subscribe`, { method: "POST" });
}

/** `DELETE /channels/{id}/subscribe` — idempotent, 204, requires auth. */
export async function unsubscribeFromChannel(client: ApiClient, channelId: string): Promise<void> {
  await client.request<void>(`/channels/${channelId}/subscribe`, { method: "DELETE" });
}
