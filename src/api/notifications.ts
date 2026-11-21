import type { ApiClient } from "./useApiClient";
import type { components } from "./schema.generated";

export type Notification = components["schemas"]["Notification"];
export type NotificationPage = components["schemas"]["NotificationPage"];

export interface GetNotificationsParams {
  cursor?: string | null;
  limit?: number;
}

/** `GET /me/notifications` — keyset-paginated, requires auth (R3-P4, already in the contract before M3). */
export async function getNotifications(
  client: ApiClient,
  params: GetNotificationsParams = {}
): Promise<NotificationPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return client.request<NotificationPage>(`/me/notifications${qs ? `?${qs}` : ""}`);
}

/** `POST /me/notifications/{id}/read` — 204, requires auth. 404 for an unknown/not-owned id. */
export async function markNotificationRead(client: ApiClient, id: string): Promise<void> {
  await client.request<void>(`/me/notifications/${id}/read`, { method: "POST" });
}

/** `POST /me/notifications/read-all` — 204, requires auth. */
export async function markAllNotificationsRead(client: ApiClient): Promise<void> {
  await client.request<void>("/me/notifications/read-all", { method: "POST" });
}
