import { apiFetch } from "./http";
import type { components } from "./schema.generated";

export type ServerInfo = components["schemas"]["ServerInfo"];

/**
 * `GET /api/server/info` — unauthenticated (PLAN.md §17.6). Used both to
 * probe a candidate server URL during first-run setup and on every launch
 * for version negotiation against `min_client_version_mobile` (§17.5).
 */
export async function getServerInfo(baseUrl: string, signal?: AbortSignal): Promise<ServerInfo> {
  return apiFetch<ServerInfo>(baseUrl, "/server/info", { signal });
}
