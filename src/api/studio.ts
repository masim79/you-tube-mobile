import type { ApiClient } from "./useApiClient";
import type { Comment, CommentPage } from "./comments";
import type { components } from "./schema.generated";

export type StudioCommentStatus = "visible" | "held" | "deleted";
export type StudioCommentAction = "pin" | "unpin" | "heart" | "unheart" | "hold" | "approve" | "delete";

export interface StudioCommentsParams {
  /** Defaults to `"held"` server-side, matching the web's moderation queue (`comments-page.ts`). */
  status?: StudioCommentStatus;
  cursor?: string | null;
  limit?: number;
}

/**
 * `GET /studio/comments` (Studio-lite, M2 chunk 3) — comments across the
 * caller's own videos. `channel_id` is deliberately omitted, same reasoning
 * as `getStudioVideos` in `videos.ts`: optional server-side, defaults to
 * the caller's primary channel, and this app has no channel switcher yet.
 */
export async function getStudioComments(client: ApiClient, params: StudioCommentsParams = {}): Promise<CommentPage> {
  const query = new URLSearchParams();
  query.set("status", params.status ?? "held");
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  return client.request<CommentPage>(`/studio/comments?${query.toString()}`);
}

/**
 * `PATCH /studio/comments/{id}` — owner only, enforced against the
 * comment's video's channel. All 7 actions the contract defines; the
 * moderation screen only shows the ones that make sense for a comment's
 * current `status`/`is_pinned`/`is_hearted` (pin vs. unpin, etc.).
 */
export async function moderateStudioComment(
  client: ApiClient,
  commentId: string,
  action: StudioCommentAction
): Promise<Comment> {
  return client.request<Comment>(`/studio/comments/${commentId}`, {
    method: "PATCH",
    body: { action },
  });
}

// --------------------------------------------------------- Creator Insights (M3 chunk 3)

export type AnalyticsSummary = components["schemas"]["AnalyticsSummary"];
export type AnalyticsDailyPoint = components["schemas"]["AnalyticsDailyPoint"];
export type RetentionPoint = components["schemas"]["RetentionPoint"];

export interface GetStudioAnalyticsParams {
  videoId: string;
  from: string;
  to: string;
}

/**
 * `GET /studio/analytics?video_id=` (R3-P2, PLAN.md §17.1's mobile row:
 * "Per-video views, watch time and retention, read-only"). Always passes
 * `video_id` — mobile's scope is explicitly per-video, never the
 * channel-level dashboard (no `video_id` omitted), so `avg_view_duration_s`/
 * `retention` are always populated here, never the `null` they'd be
 * channel-level (`AnalyticsSummary`'s doc comment in `schema.generated.ts`).
 * `channel_id` is deliberately omitted — same reasoning as `getStudioVideos`:
 * optional server-side, defaults to the caller's primary channel, and this
 * app has no channel switcher yet.
 */
export async function getStudioAnalytics(client: ApiClient, params: GetStudioAnalyticsParams): Promise<AnalyticsSummary> {
  const query = new URLSearchParams();
  query.set("video_id", params.videoId);
  query.set("from", params.from);
  query.set("to", params.to);
  return client.request<AnalyticsSummary>(`/studio/analytics?${query.toString()}`);
}
