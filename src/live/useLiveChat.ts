import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { getLiveChatBacklog, liveChatSocketUrl, type LiveChatMessage } from "../api/live";
import type { ApiClient } from "../api/useApiClient";

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15_000;
const BACKLOG_LIMIT = 50;

export type ChatConnectionState = "connecting" | "open" | "reconnecting" | "offline";

export interface UseLiveChatResult {
  /** Oldest-first, ready to render top-to-bottom in a chat list. */
  messages: LiveChatMessage[];
  connectionState: ChatConnectionState;
  /** True once the initial `GET /live/{id}/chat` backlog fetch has failed — distinct from a socket outage, which `connectionState` already covers. */
  backlogError: boolean;
  /** `false` when there's no open socket to send on (caller should disable the composer, not silently drop the message). */
  sendMessage: (body: string) => boolean;
  /** Reflects a moderation delete locally without waiting for the socket's own echo of it. */
  applyLocalDelete: (messageId: string) => void;
}

/**
 * Live chat's WebSocket client (PLAN.md §17.1 "Live", M4 chunk 3; the
 * contract's `streamLiveChat` operation, `GET /live/{id}/chat/stream`).
 * No prior WebSocket client exists anywhere in this app — `useUnreadNotificationsCount`
 * and the push-notification plumbing in M3 both stayed on polling/push,
 * so the reconnect handling below is new, not reused.
 *
 * A phone's network is categorically less stable than the browser tab the
 * web client assumes: backgrounding, Wi-Fi/cellular handoff, and a locked
 * screen all routinely drop a raw socket the OS considers idle. This hook
 * treats *any* close (clean or not — the server also uses a close frame to
 * reject a slow-mode-throttled or empty send, per the contract's own doc
 * comment on `streamLiveChat`) as "try again", with exponential backoff
 * (1s, 2s, 4s, ... capped at 15s) rather than erroring out, plus an
 * immediate reset-and-retry whenever the app returns to the foreground —
 * the backoff timer itself keeps "running" while backgrounded (JS timers
 * are throttled, not guaranteed to fire), so without this the chat could
 * sit stale for a while after resuming the app.
 *
 * Backlog (`GET /live/{id}/chat`, newest-first per the contract) is
 * fetched once per `streamId` and reversed for display; anything that
 * already arrived over the socket before that fetch resolves is kept,
 * de-duplicated by `id`.
 */
export function useLiveChat(client: ApiClient, streamId: string | null, enabled: boolean): UseLiveChatResult {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ChatConnectionState>("offline");
  const [backlogError, setBacklogError] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const clientRef = useRef(client);
  clientRef.current = client;

  const upsert = useCallback((incoming: LiveChatMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id && m.id === incoming.id);
      if (idx === -1) return [...prev, incoming];
      const next = prev.slice();
      next[idx] = incoming;
      return next;
    });
  }, []);

  // Backlog: once per streamId, independent of the socket's own lifecycle.
  useEffect(() => {
    if (!streamId) {
      setMessages([]);
      setBacklogError(false);
      return;
    }
    let cancelled = false;
    setBacklogError(false);
    void getLiveChatBacklog(clientRef.current, streamId, { limit: BACKLOG_LIMIT }).then(
      (page) => {
        if (cancelled) return;
        const oldestFirst = (page.items ?? []).slice().reverse();
        setMessages((prev) => {
          const seen = new Set(oldestFirst.map((m) => m.id));
          const alreadyLive = prev.filter((m) => m.id && !seen.has(m.id));
          return [...oldestFirst, ...alreadyLive];
        });
      },
      () => {
        if (!cancelled) setBacklogError(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  // Socket lifecycle: connect, reconnect with backoff on any close, and
  // retry immediately on foregrounding.
  useEffect(() => {
    mountedRef.current = true;

    function clearTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function scheduleReconnect() {
      if (!mountedRef.current || !enabled || !streamId) return;
      setConnectionState("reconnecting");
      attemptRef.current += 1;
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attemptRef.current - 1), MAX_BACKOFF_MS);
      clearTimer();
      timerRef.current = setTimeout(connect, delay);
    }

    function connect() {
      if (!mountedRef.current || !enabled || !streamId) return;
      const current = clientRef.current;
      if (!current.baseUrl || !current.accessToken) {
        // Not signed in / no server yet — nothing to connect with; the
        // effect re-runs once either becomes available (both are deps).
        setConnectionState("offline");
        return;
      }

      setConnectionState(attemptRef.current === 0 ? "connecting" : "reconnecting");
      const url = liveChatSocketUrl(current.baseUrl, streamId, current.accessToken);

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) return;
        attemptRef.current = 0;
        setConnectionState("open");
      };
      socket.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(String(event.data)) as LiveChatMessage;
          if (data && data.id) upsert(data);
        } catch {
          // Malformed/unrecognized frame — ignore rather than crash the chat.
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (!mountedRef.current) return;
        scheduleReconnect();
      };
      socket.onerror = () => {
        // RN's WebSocket always follows an error with a close event —
        // reconnect scheduling happens there, not duplicated here.
      };
    }

    if (enabled && streamId) {
      attemptRef.current = 0;
      connect();
    } else {
      setConnectionState("offline");
    }

    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      attemptRef.current = 0;
      clearTimer();
      connect();
    });

    return () => {
      mountedRef.current = false;
      clearTimer();
      appStateSub.remove();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, streamId, client.baseUrl, upsert]);

  const sendMessage = useCallback((body: string): boolean => {
    const trimmed = body.trim();
    const socket = socketRef.current;
    if (!trimmed || !socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ body: trimmed }));
    return true;
  }, []);

  const applyLocalDelete = useCallback((messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, body: null } : m)));
  }, []);

  return { messages, connectionState, backlogError, sendMessage, applyLocalDelete };
}
