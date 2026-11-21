import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type VideoPage = components["schemas"]["VideoPage"];

export interface ShortsFeedParams {
  cursor?: string | null;
  limit?: number;
}

/**
 * `GET /feed/shorts` (PLAN.md §17.1 "Shorts feed", backend added R4-P4,
 * contract confirmed in `vendor/you-tube/contracts/openapi.yaml`) —
 * anonymous-allowed, `videos.is_short=true` only, in the server's own
 * swipe-feed ordering. Deliberately a separate module from `feed.ts`
 * rather than a third branch on `getHomeFeed`: this endpoint takes no
 * `sort` parameter at all (the contract's own description: "not the
 * home-feed's new/views/foryou sorts"), so sharing one function would mean
 * a `sort` param that's silently ignored for this one call site.
 */
export async function getShortsFeed(client: ApiClient, params: ShortsFeedParams = {}): Promise<VideoPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<VideoPage>(`/feed/shorts${qs ? `?${qs}` : ""}`);
}
