import { useCallback, useRef } from "react";

import { apiFetch, ApiError, type RequestOptions } from "./http";
import { useAuth } from "../store/AuthContext";
import { useServer } from "../store/ServerContext";

export type ApiRequestOptions = Omit<RequestOptions, "accessToken">;

export interface ApiClient {
  /** `null` until a server has been chosen (mirrors `ServerContext.baseUrl`). */
  baseUrl: string | null;
  /** The access token as of this render — endpoint functions don't need it directly, `request` already carries it. */
  accessToken: string | null;
  /**
   * `apiFetch` bound to the app's current server and access token. Every
   * endpoint function in `src/api/*.ts` (feed.ts, search.ts, channels.ts,
   * videos.ts, comments.ts, playlists.ts) takes a `client: ApiClient` as
   * its first argument and calls this instead of `apiFetch` directly, so
   * screens never juggle refresh themselves.
   */
  request: <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
}

/**
 * The mobile equivalent of the web's HTTP interceptor (CLAUDE.md: "attaching
 * the access token and refreshing on 401"), adapted to this app's
 * keychain-based refresh — there is no httpOnly cookie a native client can
 * rely on (PLAN.md §20.2). On a 401, calls `AuthContext.silentRefresh()`
 * once and retries the original request with the freshly rotated token;
 * a second 401 (refresh itself failed, or the retried call 401s again)
 * propagates as the usual `ApiError` so call sites don't need special-case
 * handling beyond what they already do for any other failed request.
 *
 * No module-level singleton: `baseUrl` and the access token both live in
 * React context (`ServerContext`, `AuthContext`), so this hook just reads
 * the current render's values plus `AuthContext.silentRefresh` into one
 * small object. `authRef` mirrors the latest `useAuth()` result on every
 * render (a plain assignment, not an effect) so the retry below reads
 * whatever `silentRefresh()` just set on `AuthContext`'s state even when
 * this hook's own `request` closure was created on an earlier render.
 */
export function useApiClient(): ApiClient {
  const auth = useAuth();
  const { baseUrl } = useServer();

  const authRef = useRef(auth);
  authRef.current = auth;

  const request = useCallback(
    async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
      if (!baseUrl) {
        throw new Error("No server configured");
      }
      try {
        return await apiFetch<T>(baseUrl, path, {
          ...options,
          accessToken: authRef.current.accessToken,
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }
        const refreshed = await authRef.current.silentRefresh();
        if (!refreshed) {
          throw error;
        }
        return await apiFetch<T>(baseUrl, path, {
          ...options,
          accessToken: authRef.current.accessToken,
        });
      }
    },
    [baseUrl]
  );

  return { baseUrl, accessToken: auth.accessToken, request };
}
