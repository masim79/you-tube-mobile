import type { ApiClient } from "./useApiClient";

export interface Category {
  slug: string;
  label: string;
}

/**
 * `GET /discovery/categories` — anonymous-allowed. A fixed, app-defined
 * list (contracts/migrations.md 0012's header note: not database-backed),
 * used both by `/search`'s `category` filter and any browse-by-category
 * UI. The contract types this inline (no named `Category` schema), so
 * `Category` above is hand-written rather than re-exported from
 * `schema.generated.ts`.
 */
export async function getCategories(client: ApiClient): Promise<Category[]> {
  return client.request<Category[]>("/discovery/categories");
}
