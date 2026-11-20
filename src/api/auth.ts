import { apiFetch } from "./http";
import type { components } from "./schema.generated";

export type AuthSession = components["schemas"]["AuthSession"];
export type User = components["schemas"]["User"];

/**
 * The contract's `login` operation types its 200 response as `AuthSession`
 * only (`contracts/openapi.yaml` operationId `login`), but
 * `backend/app/routers/auth.py` actually returns `AuthSession |
 * TwoFactorRequired` (R3-P5's 2FA work) — a pre-existing contract/
 * implementation gap noted here rather than silently relied on. M0 has no
 * 2FA UI (not in §17.1's M0 row), so this shape is handled defensively —
 * duck-typed at runtime, not trusted from the generated schema types — by
 * showing an inline "not supported yet" message rather than crashing.
 */
export interface TwoFactorRequired {
  requires_2fa: true;
  two_factor_token: string;
}

export function isTwoFactorRequired(body: unknown): body is TwoFactorRequired {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { requires_2fa?: unknown }).requires_2fa === true
  );
}

/** `POST /auth/login` (PLAN.md §20.2, native-auth variant via `X-Client`). */
export async function login(
  baseUrl: string,
  email: string,
  password: string
): Promise<AuthSession | TwoFactorRequired> {
  return apiFetch<AuthSession | TwoFactorRequired>(baseUrl, "/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

/**
 * `POST /auth/refresh` — mobile sends `refresh_token` in the body (the
 * server has no httpOnly cookie to read from a native client, §20.2).
 * Used both for the silent refresh-on-launch flow and for rotating the
 * token the normal way before it's used again.
 */
export async function refresh(baseUrl: string, refreshToken: string): Promise<AuthSession> {
  return apiFetch<AuthSession>(baseUrl, "/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
}

/**
 * `POST /auth/logout` — requires the access token; revokes the session
 * server-side (§20.2's family revocation). The caller is responsible for
 * clearing the keychain-stored refresh token and in-memory access token
 * regardless of whether this call succeeds (a logout that can't reach the
 * server should still log the device out locally).
 */
export async function logout(baseUrl: string, accessToken: string): Promise<void> {
  await apiFetch<void>(baseUrl, "/auth/logout", { method: "POST", accessToken });
}

/** `GET /auth/me`. */
export async function getMe(baseUrl: string, accessToken: string): Promise<User> {
  return apiFetch<User>(baseUrl, "/auth/me", { accessToken });
}
