import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type VideoPage = components["schemas"]["VideoPage"];

export interface HomeFeedParams {
  sort?: "new" | "views" | "foryou";
  cursor?: string | null;
  limit?: number;
}

/** `GET /feed/home` — anonymous-allowed (PLAN.md §20.1's `security: []` + optional bearer for `foryou`/`your_reaction`). */
export async function getHomeFeed(client: ApiClient, params: HomeFeedParams = {}): Promise<VideoPage> {
  const query = new URLSearchParams();
  if (params.sort) query.set("sort", params.sort);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<VideoPage>(`/feed/home${qs ? `?${qs}` : ""}`);
}

export interface SubscriptionsFeedParams {
  cursor?: string | null;
  limit?: number;
}

/** `GET /feed/subscriptions` — requires auth (videos from channels the caller follows). */
export async function getSubscriptionsFeed(
  client: ApiClient,
  params: SubscriptionsFeedParams = {}
): Promise<VideoPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<VideoPage>(`/feed/subscriptions${qs ? `?${qs}` : ""}`);
}
