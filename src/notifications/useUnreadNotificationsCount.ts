import { useCallback, useState } from "react";

import { getNotifications } from "../api/notifications";
import type { ApiClient } from "../api/useApiClient";

/**
 * Unread-count heuristic for the bell icon's badge (PLAN.md §17.1's inbox
 * row) — "a simple heuristic from the first page's `is_read` values",
 * explicitly not a dedicated unread-count endpoint, since the contract has
 * none. Counts unread items on the first page only, so a very deep backlog
 * reads as "24+" rather than an exact total; acceptable for a badge, not
 * promised as exact anywhere in the UI.
 *
 * Exposes `refresh` rather than fetching on its own — callers call it from
 * a `useFocusEffect` (the Home screen, on every return to that tab,
 * including after visiting the inbox and marking things read) rather than
 * this hook polling or needing a shared store.
 */
export function useUnreadNotificationsCount(client: ApiClient) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const page = await getNotifications(client, { limit: 24 });
      setCount((page.items ?? []).filter((item) => item.is_read === false).length);
    } catch {
      // Best-effort — leave the previous count rather than flashing to 0.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request]);

  return { count, refresh };
}
