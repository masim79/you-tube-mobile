import { X_CLIENT_HEADER } from "../constants/client";

/**
 * `{"detail": "<message>"}` on a plain error, or FastAPI's validation
 * shape `{"detail": [{"loc": [...], "msg": ..., "type": ...}]}` on a 422
 * (§20.1). Both are normalized to a single human-readable `message` by
 * `ApiError` below, so call sites never need to branch on shape.
 */
interface ErrorBody {
  detail?: string | { loc?: unknown[]; msg?: string; type?: string }[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterS: number | null;

  constructor(status: number, message: string, retryAfterS: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterS = retryAfterS;
  }
}

function messageFromErrorBody(body: ErrorBody | null): string {
  if (!body?.detail) return "Request failed";
  if (typeof body.detail === "string") return body.detail;
  const first = body.detail[0];
  return first?.msg ?? "Validation failed";
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /**
   * A plain JSON-serializable value for every existing endpoint, or a
   * `FormData` instance for the one multipart endpoint this app calls
   * (`POST /videos/{id}/thumbnail` — §20.8/openapi.yaml's
   * `multipart/form-data` requestBody). Checked at runtime below rather
   * than split into two options, so call sites don't need a different
   * method name for the one-off multipart case.
   */
  body?: unknown;
  accessToken?: string | null;
  /** Omit when the caller is probing a candidate server URL at setup time. */
  signal?: AbortSignal;
}

/**
 * Thin fetch wrapper shared by every hand-written endpoint function in
 * `src/api/`. Not a generic HTTP client for arbitrary callers — each
 * endpoint gets its own small typed function (see `server.ts`,
 * `auth.ts`), same incremental pattern as the web's `core/api/*.api.ts`
 * (§20.8). `baseUrl` is passed explicitly rather than read from a module
 * singleton so the setup flow can probe a candidate URL before it's
 * saved anywhere.
 */
export async function apiFetch<T>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  // `FormData` is RN's own global (not `multipart/form-data`-aware fetch
  // polyfill magic) — passing it straight to `fetch`'s `body` and omitting
  // `Content-Type` lets RN's networking layer set the header itself,
  // boundary included. Setting it manually here would omit that boundary
  // and the server would fail to parse the body at all.
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Client": X_CLIENT_HEADER,
  };
  if (options.body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined
          ? undefined
          : isFormData
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    // Network-level failure (unreachable host, TLS/cleartext rejection,
    // DNS) — never thrown as an ApiError since there is no HTTP status to
    // report; the setup flow tells these apart from a real 4xx/5xx.
    throw new Error(
      cause instanceof Error ? `Could not reach server: ${cause.message}` : "Could not reach server"
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  // A non-JSON body (an nginx/proxy error page reached before the API,
  // say) must still produce a readable ApiError below, not an uncaught
  // SyntaxError from a bad JSON.parse.
  let json: unknown = null;
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterS = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : null;
    throw new ApiError(response.status, messageFromErrorBody(json as ErrorBody | null), retryAfterS);
  }

  return json as T;
}
