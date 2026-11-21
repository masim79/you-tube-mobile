import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Video = components["schemas"]["Video"];
export type VideoPage = components["schemas"]["VideoPage"];
export type VideoStatus = components["schemas"]["VideoStatus"];
export type Visibility = components["schemas"]["Visibility"];

/** `GET /videos/{id}` — anonymous-allowed (private/unlisted visibility is still enforced server-side per the caller's bearer token, PLAN.md §13). */
export async function getVideo(client: ApiClient, id: string): Promise<Video> {
  return client.request<Video>(`/videos/${id}`);
}

/**
 * `GET /uploads/{tus_upload_id}/video` (PLAN.md §20.5, contract added during
 * R1-P6/P8/P9 integration — mirrors the web's `tryResolveVideoId` in
 * `vendor/you-tube/frontend/src/app/pages/upload/upload-page.ts`). The
 * `post-finish` tusd hook creates the `videos` row server-to-server and
 * never tells the uploading client its id directly, so this is how the
 * Create screen (M1 chunk 7) learns `video_id` once the upload finishes.
 * 404s both for a non-owner and while the hook hasn't landed yet — callers
 * are expected to retry/poll a few times before giving up, same as the web.
 * Not re-exported as a named `Video`-shaped response since the contract
 * only promises `{video_id}`.
 */
export async function getVideoForUpload(client: ApiClient, tusUploadId: string): Promise<{ video_id: string }> {
  return client.request<{ video_id: string }>(`/uploads/${tusUploadId}/video`);
}

export interface RelatedVideosParams {
  cursor?: string | null;
  limit?: number;
}

/** `GET /videos/{id}/related` — anonymous-allowed, keyset-paginated. */
export async function getRelatedVideos(
  client: ApiClient,
  id: string,
  params: RelatedVideosParams = {}
): Promise<VideoPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<VideoPage>(`/videos/${id}/related${qs ? `?${qs}` : ""}`);
}

export interface ReactionResult {
  like_count?: number;
  dislike_count?: number;
  your_value?: 1 | -1 | 0;
}

/** `POST /videos/{id}/reaction` — idempotent upsert; `value: 0` clears the caller's reaction. Requires auth. */
export async function postReaction(
  client: ApiClient,
  id: string,
  value: 1 | -1 | 0
): Promise<ReactionResult> {
  return client.request<ReactionResult>(`/videos/${id}/reaction`, {
    method: "POST",
    body: { value },
  });
}

/** `PUT /videos/{id}/progress` — idempotent resume-position save. Requires auth. */
export async function updateProgress(client: ApiClient, id: string, positionS: number): Promise<void> {
  await client.request<void>(`/videos/${id}/progress`, {
    method: "PUT",
    body: { position_s: Math.max(0, Math.floor(positionS)) },
  });
}

export interface RecordViewParams {
  watchedS: number;
  sessionId: string;
  source?: "home" | "search" | "channel" | "related" | "external";
  maxPositionPct?: number | null;
}

/** `POST /videos/{id}/view` — heartbeat; anonymous-allowed, counted once per session server-side. */
export async function recordView(client: ApiClient, id: string, params: RecordViewParams): Promise<void> {
  await client.request<void>(`/videos/${id}/view`, {
    method: "POST",
    body: {
      watched_s: Math.max(0, Math.floor(params.watchedS)),
      session_id: params.sessionId,
      ...(params.source ? { source: params.source } : {}),
      ...(params.maxPositionPct != null ? { max_position_pct: params.maxPositionPct } : {}),
    },
  });
}

/** `POST /videos/{id}/watch-later` — adds to the caller's system `watch_later` playlist. Requires auth. */
export async function addToWatchLater(client: ApiClient, id: string): Promise<void> {
  await client.request<void>(`/videos/${id}/watch-later`, { method: "POST" });
}

/** `DELETE /videos/{id}/watch-later` — no-op (still 204) if it wasn't in the list. Requires auth. */
export async function removeFromWatchLater(client: ApiClient, id: string): Promise<void> {
  await client.request<void>(`/videos/${id}/watch-later`, { method: "DELETE" });
}

// --------------------------------------------------------- Studio-lite (M2 chunk 3)

export interface StudioVideosParams {
  status?: VideoStatus;
  q?: string;
  cursor?: string | null;
  limit?: number;
}

/**
 * `GET /studio/videos` — the caller's own videos, any status/visibility
 * (unlike every other video list in this file, which only ever shows what
 * the viewer is allowed to see). `channel_id` is deliberately omitted —
 * optional server-side, defaults to the caller's primary channel; this app
 * has no channel switcher yet (M1/M2 haven't built multi-channel UI).
 */
export async function getStudioVideos(client: ApiClient, params: StudioVideosParams = {}): Promise<VideoPage> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<VideoPage>(`/studio/videos${qs ? `?${qs}` : ""}`);
}

export interface UpdateVideoBody {
  title?: string;
  description?: string;
  tags?: string[];
  visibility?: Visibility;
  allow_download?: boolean;
}

/** `PATCH /videos/{id}` — owner only. Scheduling fields (`scheduled_at`/`scheduled_publish_as`) are out of scope for Studio-lite, same as the rest of this chunk's deliberately-light field set. */
export async function updateVideo(client: ApiClient, id: string, body: UpdateVideoBody): Promise<Video> {
  return client.request<Video>(`/videos/${id}`, { method: "PATCH", body });
}

/** `DELETE /videos/{id}` — owner or admin. Removes the row and its media directory; irreversible. */
export async function deleteVideo(client: ApiClient, id: string): Promise<void> {
  await client.request<void>(`/videos/${id}`, { method: "DELETE" });
}

/**
 * A local image source for a `multipart/form-data` request on React
 * Native — the same `{uri, name, type}` shape `tusUpload.ts`'s
 * `RnUploadFile` uses for the tus upload body, redeclared locally rather
 * than imported from `src/upload/` so this API module doesn't pick up a
 * dependency on the upload feature for one shared shape.
 */
export interface RnImageFile {
  uri: string;
  name: string;
  type: string;
}

export type SetThumbnailPayload = { candidate: 0 | 1 | 2 } | { file: RnImageFile };

/**
 * `POST /videos/{id}/thumbnail` — owner only, multipart. Either picks one
 * of the 3 auto-generated candidates the encoder produced (served from the
 * frozen, predictable `/media/videos/{id}/thumb_{0,1,2}.jpg` path per the
 * web's `thumbnail-picker.ts`, not a field on `Video` — there is no
 * `thumbnail_candidates` array in the contract) or uploads a custom image
 * picked via `expo-image-picker`. `ApiClient.request` passes a `FormData`
 * body straight through `apiFetch` (see `http.ts`'s `isFormData` branch)
 * rather than JSON-encoding it.
 */
export async function setThumbnail(client: ApiClient, id: string, payload: SetThumbnailPayload): Promise<Video> {
  const form = new FormData();
  if ("candidate" in payload) {
    form.append("candidate", String(payload.candidate));
  } else {
    // React Native's `FormData.append` accepts this `{uri, name, type}`
    // shape for a file part (not a web `Blob`) — the same well-established
    // RN pattern `tusUpload.ts`'s header comment documents for tus's own
    // file input, applied here to a plain multipart part instead.
    form.append("file", { uri: payload.file.uri, name: payload.file.name, type: payload.file.type } as unknown as Blob);
  }
  return client.request<Video>(`/videos/${id}/thumbnail`, { method: "POST", body: form });
}

/** Frozen, predictable path for one of the 3 auto-generated thumbnail candidates — see `setThumbnail`'s doc comment. Resolve against `baseUrl` with `resolveMediaUrl` before rendering. */
export function studioThumbnailCandidatePath(videoId: string, candidate: 0 | 1 | 2): string {
  return `/media/videos/${videoId}/thumb_${candidate}.jpg`;
}

// --------------------------------------------------------- Offline downloads (M2 chunk 4)

export type DownloadOptions = components["schemas"]["DownloadOptions"];
export type DownloadRequestResult = components["schemas"]["DownloadRequestResult"];

/**
 * `GET /videos/{id}/download/options` (§9.1). Requires auth (server 401s
 * an anonymous caller). Real file sizes per quality so `DownloadButton` can
 * warn before a large download — see `downloadManager.ts`.
 */
export async function getDownloadOptions(client: ApiClient, id: string): Promise<DownloadOptions> {
  return client.request<DownloadOptions>(`/videos/${id}/download/options`);
}

/**
 * `POST /videos/{id}/download?quality=` (§9.1). Returns the signed link
 * immediately if the remux is already cached (`status: "ready"`), or
 * `status: "preparing"` + `job_id` while the worker remuxes it — the
 * contract's own description says the client polls this *same* endpoint
 * again rather than a separate job-status route, which is what
 * `downloadManager.ts`'s `resolveDownloadUrl` does.
 */
export async function requestDownload(client: ApiClient, id: string, quality: string): Promise<DownloadRequestResult> {
  return client.request<DownloadRequestResult>(`/videos/${id}/download?quality=${encodeURIComponent(quality)}`, {
    method: "POST",
  });
}
