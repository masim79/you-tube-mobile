import { apiFetch } from "./http";
import type { components } from "./schema.generated";

export type SetupQr = components["schemas"]["SetupQr"];

/**
 * `GET /api/setup/qr` — admin-only (PLAN.md §17.6). The *web* Admin page
 * is what renders this payload as an on-screen QR code; the mobile app's
 * job is the scanning side (decoding a photographed QR's raw string back
 * into this same `{lan_url, tailscale_name}` shape — see
 * `src/app/setup/scan.tsx`), not calling this endpoint itself during
 * first run, when the app has no access token yet. Wrapped here for
 * parity with the other five M0 endpoints and for any later screen (e.g.
 * an already-authenticated admin viewing their own server's QR from
 * within the app).
 */
export async function getSetupQr(baseUrl: string, accessToken: string): Promise<SetupQr> {
  return apiFetch<SetupQr>(baseUrl, "/setup/qr", { accessToken });
}
