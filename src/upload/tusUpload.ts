import { useCallback, useEffect, useRef, useState } from "react";
import { Upload as TusUpload } from "tus-js-client";

/**
 * The exact tus metadata shape §20.5 requires — identical field set to the
 * web's `vendor/you-tube/frontend/src/app/pages/upload/upload-session.ts`
 * `UploadMetadata`. All values are strings: tus `MetaData` has no other
 * type, and the backend's `_parse_bool_metadata` reads `"true"`/`"1"` as
 * truthy and everything else (including absence) as `false`, so `is_short`
 * is `'true' | 'false'`, never a native `boolean`.
 */
export interface UploadMetadata {
  channel_id: string;
  title: string;
  filename: string;
  filetype: string;
  description?: string;
  /** Comma-separated, per §20.5 — the form collects an array, the caller joins it. */
  tags?: string;
  category?: string;
  visibility?: "public" | "unlisted" | "private";
  is_short?: "true" | "false";
}

/**
 * `tus-js-client` has no network-state events of its own (unlike Uppy's
 * `@uppy/tus`, which surfaces `is-offline`/`is-online` from Uppy core) —
 * adding a dedicated "paused while offline" phase here would mean pulling
 * in `@react-native-community/netinfo` as a new dependency for one state.
 * A dropped connection instead shows as ordinary retry activity: the
 * library's default `onShouldRetry` (undisturbed here, same principle as
 * the web's own comment) retries network errors against `retryDelays`
 * before ever reaching `onError`, so phase stays `"uploading"` through a
 * transient drop and only flips to `"error"` once retries are exhausted.
 */
export type UploadPhase = "idle" | "uploading" | "succeeded" | "error" | "canceled";

export interface UploadState {
  phase: UploadPhase;
  bytesUploaded: number;
  bytesTotal: number;
  /** The tus resource id tusd assigned on creation — the last path segment of its upload URL. */
  tusUploadId: string | null;
  errorMessage: string | null;
}

const INITIAL_STATE: UploadState = {
  phase: "idle",
  bytesUploaded: 0,
  bytesTotal: 0,
  tusUploadId: null,
  errorMessage: null,
};

/**
 * A local video source for `tus-js-client` on React Native: a plain
 * `{uri, name, type}` object, **not** a `File`/`Blob` instance. Both
 * `expo-image-picker`'s `ImagePickerAsset` and `expo-camera`'s
 * `recordAsync()` result hand back exactly this shape (a `file://` uri),
 * so callers construct one directly from either picker's result.
 */
export interface RnUploadFile {
  uri: string;
  name: string;
  type: string;
  /** Known upfront from the picker/recorder when available, for the progress UI before the first `onProgress` tick lands. */
  size?: number;
}

function extractTusIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const segments = url.split("/").filter(Boolean);
  return segments.at(-1) ?? null;
}

export interface StartUploadArgs {
  /** This app's current server, e.g. `http://192.168.1.20`. */
  baseUrl: string;
  /** Captured once at `start()` time, not read live — see the file-header note on `headers` below. */
  accessToken: string;
  file: RnUploadFile;
  metadata: UploadMetadata;
}

/**
 * Owns one resumable tus upload for the Create screen (PLAN.md §17.1
 * "Create/Upload", M1 chunk 7). The mobile equivalent of the web's
 * `UploadSession` (`vendor/you-tube/frontend/src/app/pages/upload/upload-session.ts`),
 * reimplemented against `tus-js-client` directly rather than Uppy/`@uppy/tus`
 * — Uppy is a browser-oriented library with no React Native build (its
 * `@uppy/core`/`@uppy/tus` packages assume `File`/`Blob`/DOM APIs that don't
 * exist here).
 *
 * `tus-js-client` (not `expo-file-system`'s own `File.createUploadTask`,
 * which only speaks plain multipart/binary HTTP upload, not the tus
 * protocol's create/PATCH/offset dance) is the right tool here, and its
 * React Native support was verified by reading its installed source
 * (`node_modules/tus-js-client/lib.es5/browser/fileReader.js`,
 * `isReactNative.js`, `uriToBlob.js`) rather than assumed from the README:
 * on `require("tus-js-client")`, Metro's `resolverMainFields` (`["react-native",
 * "browser", "main"]`, set by `@expo/metro-config`) follows the package's
 * own `browser` field remap to its browser build — the *same* build the web
 * app's bundler would also reach — which already special-cases React
 * Native: `fileReader.js`'s `openFile` checks `isReactNative() && input.uri
 * !== undefined` and, when true, resolves the whole file to a `Blob` via
 * `uriToBlob()` (an `XMLHttpRequest` GET of the `file://` uri with
 * `responseType: 'blob'` — the same well-established RN trick used to read
 * local files for upload elsewhere, e.g. Firebase Storage's RN SDK), then
 * uploads that `Blob` in `chunkSize`-sized `Blob.slice()` pieces over
 * `XHRHttpStack` (an `XMLHttpRequest` wrapper) — RN's built-in `Blob`/`XMLHttpRequest`
 * implementation supports both `.slice()` and upload progress events, which
 * is what `isSupported` even checks for.
 *
 * Two honest gaps against the web version, not silently dropped:
 *  - **No resume-after-relaunch.** The library's default `urlStorage` is
 *    `WebStorageUrlStorage` (backed by `window.localStorage`) when
 *    `canStoreURLs` is true, else `NoopUrlStorage` — and RN has no
 *    `localStorage`, so it's always the no-op here. Resumability *within* a
 *    session (a dropped request mid-upload, verified above) is unaffected;
 *    what's lost is tusd remembering the upload url across an app kill, and
 *    this app also has no "resume my last upload" affordance that would
 *    need it (no persisted pending-upload record) — building one is a
 *    reasonable follow-up, not attempted here. A custom `UrlStorage` backed
 *    by `@react-native-async-storage/async-storage` (already a dependency)
 *    would close the storage half of this gap in isolation, but without the
 *    UI to rediscover and reattach to a dropped upload on relaunch it
 *    wouldn't do anything on its own, so it's left out rather than added
 *    half-finished.
 *  - **`headers` is a plain object here, not a function.** Uppy's
 *    `@uppy/tus` took `headers: () => ({...})`, re-read on every request, so
 *    a token refreshed mid-upload was picked up automatically.
 *    `tus-js-client`'s `UploadOptions.headers` is `{[key: string]: string}`
 *    — fixed at `start()` time. A multi-hour upload that outlives a 15-minute
 *    access token will 401 on its next request (tus's default
 *    `onShouldRetry` does not retry 4xx responses, verified from the
 *    library's docs) and land in `"error"`; the Create screen's retry path
 *    re-reads the current token from `AuthContext` before calling `start()`
 *    again, so retrying after a fresh login/refresh works, it just isn't
 *    silent.
 */
export function useTusUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE);
  const uploadRef = useRef<TusUpload | null>(null);

  const start = useCallback(({ baseUrl, accessToken, file, metadata }: StartUploadArgs): void => {
    // A second start() while one is already running replaces it outright —
    // the Create screen only ever has one upload in flight at a time.
    uploadRef.current?.abort(false).catch(() => undefined);

    const upload = new TusUpload(
      // tus-js-client's own .d.ts types `file` as `File | Blob | Buffer |
      // Pick<ReadableStreamDefaultReader, 'read'>` — narrower than what it
      // actually accepts at runtime. It doesn't model its own documented
      // React Native `{uri}` input (see the file-header note above), so this
      // cast is deliberate, not a type-safety hole being papered over.
      file as unknown as File,
      {
        // tusd lives at /uploads/*, not under /api/* — same split as the
        // web (nginx/nginx.conf's `location /uploads/`), so this is an
        // absolute URL built from the app's own `baseUrl`, not something
        // routed through `ApiClient.request` (which always prefixes `/api`).
        //
        // The trailing slash is load-bearing, not cosmetic — see the web's
        // `upload-session.ts` for the full nginx-redirect-downgrades-the-
        // method story this avoids.
        endpoint: `${baseUrl.replace(/\/+$/, "")}/uploads/`,
        // 6 MB chunks, matching the web's own choice — fine progress
        // granularity without defeating resume.
        chunkSize: 6 * 1024 * 1024,
        metadata: { ...metadata },
        headers: { Authorization: `Bearer ${accessToken}` },
        onProgress: (bytesUploaded, bytesTotal) => {
          setState((s) => ({
            ...s,
            bytesUploaded,
            bytesTotal,
            tusUploadId: extractTusIdFromUrl(upload.url) ?? s.tusUploadId,
          }));
        },
        onSuccess: () => {
          setState((s) => ({ ...s, phase: "succeeded", tusUploadId: extractTusIdFromUrl(upload.url) ?? s.tusUploadId }));
        },
        onError: (error) => {
          setState((s) => ({ ...s, phase: "error", errorMessage: error.message }));
        },
      }
    );

    uploadRef.current = upload;
    setState({ ...INITIAL_STATE, phase: "uploading", bytesTotal: file.size ?? 0 });
    upload.start();
  }, []);

  /** Cancels the in-flight upload and terminates the tus resource server-side (§20.5's hook never fires). */
  const cancel = useCallback((): void => {
    const upload = uploadRef.current;
    uploadRef.current = null;
    if (upload) {
      void upload.abort(true).catch(() => undefined);
    }
    setState((s) => (s.phase === "uploading" ? { ...s, phase: "canceled" } : s));
  }, []);

  // Best-effort abort (no server terminate — leaving the tus resource
  // around for a possible resume is more correct than deleting it) if the
  // screen unmounts mid-upload.
  useEffect(() => {
    return () => {
      uploadRef.current?.abort(false).catch(() => undefined);
    };
  }, []);

  return { state, start, cancel };
}
