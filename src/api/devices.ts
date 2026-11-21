import type { ApiClient } from "./useApiClient";

/**
 * `POST /me/devices` / `DELETE /me/devices/{id}` — M3 chunk 1 (push
 * registration, PLAN.md §17.1/§17.6).
 *
 * **Contract gap, read before touching this file**: unlike every other
 * endpoint this app calls, these two are *not* in
 * `vendor/you-tube/contracts/openapi.yaml` yet — `npm run gen:api` after
 * bumping the submodule to the commit that adds them
 * (`feat(api): add devices table and push-token registration endpoints`,
 * `96f5969`) produced no `Device`/`DeviceOut` types and no `/me/devices`
 * path, only an unrelated two-line diff elsewhere. The backend code itself
 * (`backend/app/routers/notifications.py`, `backend/app/schemas/device.py`)
 * is real, merged, and tested (`backend/tests/test_devices.py`) — the
 * schemas below are transcribed from `app/schemas/device.py` directly, not
 * invented. Flagged as a contract-change packet; not fixed here, since
 * `contracts/openapi.yaml` belongs to the API lane, not this one.
 */
export type DevicePlatform = "ios" | "android";

export interface Device {
  id: string;
  platform: DevicePlatform;
  app_version: string;
  created_at: string;
  last_seen_at: string;
}

export interface RegisterDeviceBody {
  expo_push_token: string;
  platform: DevicePlatform;
  app_version: string;
}

/** Upsert keyed server-side on `expo_push_token` — safe to call again with the same token. */
export async function registerDevice(client: ApiClient, body: RegisterDeviceBody): Promise<Device> {
  return client.request<Device>("/me/devices", { method: "POST", body });
}

/** Owner-scoped; 404s for a non-owner or unknown id, never 403 (existence-hiding, same as every other owned resource). */
export async function unregisterDevice(client: ApiClient, id: string): Promise<void> {
  await client.request<void>(`/me/devices/${id}`, { method: "DELETE" });
}
