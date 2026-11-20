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

export type NotificationLevel = "all" | "personalized" | "none";

export interface UpdateSubscriptionLevelResult {
  notification_level?: NotificationLevel;
}

/**
 * `PATCH /channels/{id}/subscription` (added R3-P4) — additive to the
 * boolean subscribe/unsubscribe above: only changes how notified an
 * already-subscribed caller is. Requires auth.
 *
 * Same contract gap the web client already documents
 * (`subscription-level-menu.ts`): there is no `GET` for the caller's
 * *current* level, so a screen has no way to know it on load and defaults
 * to `personalized` (the DB default) until the caller explicitly changes
 * it this session.
 */
export async function updateSubscriptionLevel(
  client: ApiClient,
  channelId: string,
  level: NotificationLevel
): Promise<UpdateSubscriptionLevelResult> {
  return client.request<UpdateSubscriptionLevelResult>(`/channels/${channelId}/subscription`, {
    method: "PATCH",
    body: { notification_level: level },
  });
}
