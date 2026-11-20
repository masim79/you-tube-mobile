import React, { createContext, useContext, useMemo, useState } from "react";

import * as authApi from "../api/auth";
import { ApiError } from "../api/http";
import * as secureStorage from "./secureStorage";
import { useServer } from "./ServerContext";

interface AuthContextValue {
  accessToken: string | null;
  user: authApi.User | null;
  isAuthenticated: boolean;
  /**
   * Logs in against `baseUrl`. Resolves to `{twoFactorRequired: true}`
   * without throwing when the account needs a 2FA code — M0 has no 2FA
   * screen, so the caller shows an inline "not supported yet" message
   * rather than treating it as a login failure.
   */
  login: (
    email: string,
    password: string
  ) => Promise<{ twoFactorRequired: true } | { twoFactorRequired: false }>;
  /** Clears local state regardless of whether the server call succeeds. */
  logout: () => Promise<void>;
  /**
   * Reads the keychain refresh token and calls `POST /auth/refresh`.
   * Returns `true` on success (state is now authenticated), `false`
   * otherwise (no stored token, or it was rejected/rotated-out from
   * elsewhere) — the caller routes to the login screen either way, never
   * throws for the "not logged in" case.
   */
  silentRefresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { baseUrl } = useServer();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<authApi.User | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      user,
      isAuthenticated: accessToken !== null,

      login: async (email, password) => {
        if (!baseUrl) throw new Error("No server configured");
        const result = await authApi.login(baseUrl, email, password);
        if (authApi.isTwoFactorRequired(result)) {
          return { twoFactorRequired: true };
        }
        // §20.2: with X-Client: hometube-mobile, the refresh token comes
        // back in the body for keychain storage — there is no cookie.
        if (result.refresh_token) {
          await secureStorage.setRefreshToken(result.refresh_token);
        }
        setAccessToken(result.access_token ?? null);
        setUser(result.user ?? null);
        return { twoFactorRequired: false };
      },

      logout: async () => {
        const token = accessToken;
        setAccessToken(null);
        setUser(null);
        await secureStorage.clearRefreshToken();
        if (baseUrl && token) {
          try {
            await authApi.logout(baseUrl, token);
          } catch {
            // Best-effort: the device logs out locally either way (see
            // the interface doc above) — a server that can't be reached
            // right now shouldn't trap the user in a logged-in-looking
            // state.
          }
        }
      },

      silentRefresh: async () => {
        if (!baseUrl) return false;
        const storedRefreshToken = await secureStorage.getRefreshToken();
        if (!storedRefreshToken) return false;
        try {
          const session = await authApi.refresh(baseUrl, storedRefreshToken);
          if (session.refresh_token) {
            await secureStorage.setRefreshToken(session.refresh_token);
          }
          setAccessToken(session.access_token ?? null);
          setUser(session.user ?? null);
          return true;
        } catch (error) {
          // §20.2: an already-used/expired/revoked refresh token is a
          // real 401, not a transient failure — clear it so the app
          // doesn't keep retrying a token that will never work again.
          if (error instanceof ApiError && error.status === 401) {
            await secureStorage.clearRefreshToken();
          }
          return false;
        }
      },
    }),
    [accessToken, user, baseUrl]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be called within an <AuthProvider>");
  return ctx;
}
