import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Comment = components["schemas"]["Comment"];
export type CommentPage = components["schemas"]["CommentPage"];

export interface CommentsParams {
  cursor?: string | null;
  limit?: number;
  sort?: "top" | "new";
}

/** `GET /videos/{id}/comments` — anonymous-allowed. A page of *top-level* comments only (see the reply note below). */
export async function getComments(
  client: ApiClient,
  videoId: string,
  params: CommentsParams = {}
): Promise<CommentPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.sort) query.set("sort", params.sort);
  const qs = query.toString();
  return client.request<CommentPage>(`/videos/${videoId}/comments${qs ? `?${qs}` : ""}`);
}

/** `POST /videos/{id}/comments` — requires auth, rate-limited (10/min). */
export async function createComment(client: ApiClient, videoId: string, body: string): Promise<Comment> {
  return client.request<Comment>(`/videos/${videoId}/comments`, {
    method: "POST",
    body: { body },
  });
}

/**
 * `POST /comments/{id}/replies` — one level of replies only, a reply to a
 * reply is rejected with 400. Requires auth, rate-limited.
 *
 * **Known contract gap, already flagged (web's R1-P13 report filed a
 * contract-change request; not re-filed here):** there is no `GET`
 * endpoint that returns a comment's existing replies —
 * `GET /videos/{id}/comments` explicitly returns top-level comments only,
 * and this `POST` is the only reply-shaped operation in the contract. So
 * there is no `getCommentReplies` function here to match: a screen that
 * wants to show a thread's replies has to accumulate them itself from its
 * own successful `replyToComment` calls for the current session, same
 * "document the gap, ship an honest behavior" choice the web client's
 * `CommentItem` already made (`frontend/src/app/shared/comments/comment-item.ts`)
 * — correct for as long as the screen stays open, but a relaunch (or
 * another viewer) currently has no way to see replies posted earlier.
 */
export async function replyToComment(client: ApiClient, commentId: string, body: string): Promise<Comment> {
  return client.request<Comment>(`/comments/${commentId}/replies`, {
    method: "POST",
    body: { body },
  });
}

/** `DELETE /comments/{id}` — owner, video owner, or admin/moderator. */
export async function deleteComment(client: ApiClient, commentId: string): Promise<void> {
  await client.request<void>(`/comments/${commentId}`, { method: "DELETE" });
}
