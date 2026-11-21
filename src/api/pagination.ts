import { useCallback, useRef, useState } from "react";

/**
 * Shape shared by every keyset-paginated list response in the contract
 * (`VideoPage`, `CommentPage`, `PlaylistPage` — PLAN.md §20.1: "Pagination
 * is keyset, never OFFSET. Cursors are opaque base64 of `{k, id}`"). Fields
 * are optional here because that's how `openapi-typescript` types a schema
 * with no `required` list (see `schema.generated.ts`), even though the
 * server always sends both.
 */
export interface Page<T> {
  items?: T[];
  next_cursor?: string | null;
}

export interface UseCursorPageResult<T> {
  items: T[];
  /** True only for the initial `reload()`, not for `loadMore()`. */
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  /** False once a page comes back with `next_cursor: null`. */
  hasMore: boolean;
  /** Fetches from the start (`cursor: null`) and replaces `items`. */
  reload: () => Promise<void>;
  /** Fetches the next page and appends. No-op while already loading, or once `hasMore` is false. */
  loadMore: () => Promise<void>;
  /**
   * Drops every item matching `predicate` from local state, without a
   * refetch. Added for M2 chunk 1's library-management screens (History,
   * Watch Later, Liked, Playlist detail) — each deletes one row via its own
   * endpoint and then wants the list to reflect that immediately rather
   * than reloading from `cursor: null` and losing scroll position. Additive
   * and unused by M1's read-only feeds (Home/Search/Channel).
   */
  removeItem: (predicate: (item: T) => boolean) => void;
}

/**
 * Small cursor-pagination helper shared by any "load a page, append, track
 * next_cursor, expose loadMore()" screen — the home feed, search results,
 * a channel's video list, etc. (M1 chunks 2-4). Deliberately not a generic
 * infinite-list *component*: each of those screens has its own chip/filter
 * bar and empty/error states around the list, so only the data-fetching
 * part is shared here.
 *
 * `fetchPage` must be a stable reference (e.g. wrapped in the caller's own
 * `useCallback`) — it's a dependency of this hook's internal callbacks, so
 * a new function identity on every render would defeat the loading guards
 * below (and, with it passed to an effect, would refetch on every render).
 */
export function useCursorPage<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>
): UseCursorPageResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const page = await fetchPage(null);
      setItems(page.items ?? []);
      cursorRef.current = page.next_cursor ?? null;
      setHasMore(cursorRef.current !== null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Failed to load"));
    } finally {
      setIsLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPage(cursorRef.current);
      setItems((previous) => [...previous, ...(page.items ?? [])]);
      cursorRef.current = page.next_cursor ?? null;
      setHasMore(cursorRef.current !== null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Failed to load more"));
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchPage, isLoading, isLoadingMore, hasMore]);

  const removeItem = useCallback((predicate: (item: T) => boolean) => {
    setItems((previous) => previous.filter((item) => !predicate(item)));
  }, []);

  return { items, isLoading, isLoadingMore, error, hasMore, reload, loadMore, removeItem };
}
