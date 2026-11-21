import type { Href } from "expo-router";

/**
 * Shared by the in-app inbox's tap handler (`src/app/notifications.tsx`)
 * and the push-tap listener (`src/notifications/pushRegistration.ts`'s
 * `useNotificationListeners`) — exactly one mapping from a notification's
 * `{type, payload}` to a route, per the task brief ("factor this into one
 * shared function both call, don't duplicate it").
 */
export interface NotificationLike {
  type?: string;
  payload?: Record<string, unknown>;
}

/**
 * `video_published`'s payload is `{video_id, channel_id}` — read from
 * `vendor/you-tube/backend/app/services/notifications.py`'s
 * `_resolve_channel_and_payload` (the only source of truth for this shape;
 * it isn't in `contracts/openapi.yaml` beyond `payload: object`) — so this
 * opens the watch screen directly on `video_id`, no channel lookup needed.
 *
 * `community_post`'s payload is `{post_id, channel_id}` (same source).
 * The brief's "a community_post one can just open the relevant channel for
 * now" turns out not to be buildable against the current contract: the
 * only channel screen route (`/channel/[handle]`) and the only channel
 * lookup (`GET /channels/{handle}`) are keyed by `handle`, and there is no
 * `GET /channels/{id}` (only `PATCH`, owner-only) or `GET /posts/{id}` to
 * resolve a `channel_id` to a `handle` — confirmed against
 * `backend/app/services/discovery.py`'s `get_channel_by_handle`, which
 * matches on `handle` only. Rather than guess a route or hit a 404,
 * `community_post` resolves to `null` here (no navigation; the caller
 * still marks it read). Worth a contract-change request — denormalizing
 * `channel_handle` onto this payload the same way `Video.channel_handle`
 * already solves the identical problem for videos — but not invented here.
 *
 * `reply`/`mention` are valid `Notification.type` values in the schema but
 * nothing server-side enqueues them yet
 * (`backend/app/jobs/notify_subscribers.py`'s own docstring: "not enqueued
 * by anything yet"), so there's no real payload shape to route from either
 * — also `null`.
 */
export function getNotificationRoute(notification: NotificationLike): Href | null {
  const payload = notification.payload ?? {};
  if (notification.type === "video_published") {
    const videoId = payload.video_id;
    if (typeof videoId === "string" && videoId.length > 0) {
      return `/watch/${videoId}` as Href;
    }
  }
  return null;
}
