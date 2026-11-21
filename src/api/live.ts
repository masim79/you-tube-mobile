import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type LiveStream = components["schemas"]["LiveStream"];
export type LiveStreamKey = components["schemas"]["LiveStreamKey"];
export type LiveChatMessage = components["schemas"]["LiveChatMessage"];
export type LiveChatMessagePage = components["schemas"]["LiveChatMessagePage"];

/**
 * `GET /channels/{id}/live` (R4-P2) — public, anonymous-allowed. Whether a
 * channel is currently live (`status`), and the HLS `playback_url` when it
 * is. Takes the channel's `id`, not its `handle` — the only live-specific
 * endpoint keyed that way, same as every other `/channels/{id}/*` route
 * added from R4-P2 onward.
 */
export async function getChannelLiveStatus(client: ApiClient, channelId: string): Promise<LiveStream> {
  return client.request<LiveStream>(`/channels/${channelId}/live`);
}

/**
 * `POST /channels/{id}/live/stream-key` (R4-P2) — owner-only. Rotates (not
 * accumulates) the channel's RTMP stream key; returned once, never
 * re-readable afterward (same handling as a refresh token, per the
 * contract's own doc comment).
 */
export async function issueLiveStreamKey(client: ApiClient, channelId: string): Promise<LiveStreamKey> {
  return client.request<LiveStreamKey>(`/channels/${channelId}/live/stream-key`, { method: "POST" });
}

/**
 * `PATCH /channels/{id}/live/settings` (R4-P3) — owner-only. Slow mode, in
 * seconds between messages per user; `0` disables it.
 */
export async function updateLiveChatSettings(
  client: ApiClient,
  channelId: string,
  slowModeS: number
): Promise<LiveStream> {
  return client.request<LiveStream>(`/channels/${channelId}/live/settings`, {
    method: "PATCH",
    body: { slow_mode_s: slowModeS },
  });
}

/**
 * `POST /live/{id}/end` (R4-P2) — owner-only. Takes the *stream's* own
 * `id` (`LiveStream.id`), not the channel id — same effect as mediamtx's
 * on-unpublish webhook, for ending a stream from this UI instead of OBS.
 * The response's `saved_video_id` is only populated once `save_live_stream`
 * finishes, which this app doesn't wait on — the Watch screen already
 * handles the saved video the normal way whenever the caller next opens it.
 */
export async function endLiveStream(client: ApiClient, streamId: string): Promise<LiveStream> {
  return client.request<LiveStream>(`/live/${streamId}/end`, { method: "POST" });
}

export interface GetLiveChatBacklogParams {
  cursor?: string | null;
  limit?: number;
}

/**
 * `GET /live/{id}/chat` (R4-P3) — public, anonymous-allowed. Newest-first
 * backlog on join; the live socket (`src/live/useLiveChat.ts`) never
 * replays history itself, same split as `/me/notifications` vs.
 * `/notifications/stream`.
 */
export async function getLiveChatBacklog(
  client: ApiClient,
  streamId: string,
  params: GetLiveChatBacklogParams = {}
): Promise<LiveChatMessagePage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<LiveChatMessagePage>(`/live/${streamId}/chat${qs ? `?${qs}` : ""}`);
}

/**
 * `DELETE /live/chat/{message_id}` (R4-P3) — stream owner or a channel
 * moderator only. Soft-delete, broadcast over the socket to everyone else
 * already connected; this caller applies the same change to its own local
 * list immediately rather than waiting for its own echo (see
 * `useLiveChat`'s `applyLocalDelete`).
 */
export async function deleteLiveChatMessage(client: ApiClient, messageId: string): Promise<void> {
  await client.request<void>(`/live/chat/${messageId}`, { method: "DELETE" });
}

/**
 * Builds the `ws(s)://.../api/live/{id}/chat/stream?token=` URL for the
 * raw `WebSocket` in `useLiveChat` — not a `client.request` call, since
 * this is a protocol upgrade, not a JSON fetch (same reasoning
 * `contracts/openapi.yaml` gives for documenting it outside the normal
 * REST shape). Mirrors `apiFetch`'s own `/api` prefix and trailing-slash
 * trim so the two paths-of-the-same-base-url never drift apart.
 */
export function liveChatSocketUrl(baseUrl: string, streamId: string, accessToken: string): string {
  const wsBase = baseUrl.replace(/\/+$/, "").replace(/^https/i, "wss").replace(/^http/i, "ws");
  return `${wsBase}/api/live/${streamId}/chat/stream?token=${encodeURIComponent(accessToken)}`;
}
