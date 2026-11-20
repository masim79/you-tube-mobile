import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type VideoPage = components["schemas"]["VideoPage"];

export interface SearchParams {
  q: string;
  sort?: "relevance" | "new" | "views";
  /** `short` < 4 min, `medium` 4-20 min, `long` > 20 min (R3-P7). */
  duration?: "short" | "medium" | "long" | null;
  publishedAfter?: string | null;
  /** One of `GET /discovery/categories`' slugs. */
  category?: string | null;
  cursor?: string | null;
  limit?: number;
}

/** `GET /search` — anonymous-allowed, ranked by relevance by default. */
export async function search(client: ApiClient, params: SearchParams): Promise<VideoPage> {
  const query = new URLSearchParams({ q: params.q });
  if (params.sort) query.set("sort", params.sort);
  if (params.duration) query.set("duration", params.duration);
  if (params.publishedAfter) query.set("published_after", params.publishedAfter);
  if (params.category) query.set("category", params.category);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  return client.request<VideoPage>(`/search?${query.toString()}`);
}
