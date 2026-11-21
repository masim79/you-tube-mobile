import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import React, { useEffect, useRef } from "react";

import { markNotificationRead } from "../api/notifications";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../store/AuthContext";
import { ensureDefaultAndroidChannel } from "./androidChannels";
import { getNotificationRoute, type NotificationLike } from "./deepLink";
import { registerForPushNotifications } from "./pushRegistration";

/**
 * How a foreground notification behaves while the app is open — needed
 * since neither this chunk nor M1 chunk 7's upload/download progress
 * notifications ever set one, and `expo-notifications` requires an
 * explicit handler to show anything while foregrounded (SDK 58's default
 * is to show nothing without one). Applies to every notification this app
 * schedules or receives, local and remote alike, which is the intended
 * scope — one app-wide policy, not a per-feature one.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** A push notification's `data` payload, as built by `_dispatch_expo_push` in `backend/app/jobs/notify_subscribers.py`. */
interface PushData extends NotificationLike {
  notification_id?: string;
}

function dataFromResponse(response: Notifications.NotificationResponse | null): PushData | null {
  const data = response?.notification.request.content.data;
  return data && typeof data === "object" ? (data as PushData) : null;
}

/**
 * Mounted once at the true app root (`src/app/_layout.tsx`), alongside
 * `Bootstrap`/`MiniPlayer` — the brief's "set this up once at app start"
 * for Android channels, extended to cover the rest of push registration's
 * one-time wiring so there's a single place for it. Renders nothing.
 *
 * Three jobs:
 *  1. Android notification channel, unconditionally (§17.1 "OS-level quiet
 *     handling") — cheap and idempotent, doesn't need to wait for auth.
 *  2. Registers this device for push once the user is authenticated — a
 *     short delay after `isAuthenticated` flips true rather than the
 *     instant it does, so the permission dialog appears once the user is
 *     actually looking at a screen (Home, via `Bootstrap`'s redirect) and
 *     not layered on top of the launch splash — the brief's "not a
 *     cold-start interrupt before the user has even seen the app". This
 *     fires identically for a fresh login and a silently-resumed session
 *     from a previous launch (`AuthContext` exposes no way to tell those
 *     apart without touching its internals, which the brief forbids) —
 *     documented rather than silently assumed away.
 *  3. Deep-links on a notification tap, both while running
 *     (`addNotificationResponseReceivedListener`) and for the "app was
 *     killed, opened by tapping a notification" case
 *     (`getLastNotificationResponseAsync`, checked once on mount) — same
 *     `getNotificationRoute` mapping the in-app inbox uses, so there is
 *     exactly one place that interprets a notification's payload.
 */
export function PushNotificationsBootstrap(): null {
  const router = useRouter();
  const client = useApiClient();
  const { isAuthenticated } = useAuth();
  const hasRegisteredRef = useRef(false);
  const hasCheckedLastResponseRef = useRef(false);

  useEffect(() => {
    void ensureDefaultAndroidChannel();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || hasRegisteredRef.current) return;
    hasRegisteredRef.current = true;
    const timer = setTimeout(() => {
      void registerForPushNotifications(client);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- see file doc: client.request is the stable part
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, client.request]);

  useEffect(() => {
    if (isAuthenticated) {
      hasRegisteredRef.current = false;
    }
  }, [isAuthenticated]);

  function openFromPushData(data: PushData | null) {
    if (!data) return;
    if (data.notification_id) {
      void markNotificationRead(client, data.notification_id).catch(() => {
        // Best-effort — a failed mark-as-read must never block navigation.
      });
    }
    const route = getNotificationRoute(data);
    if (route) router.push(route);
  }

  // The "tapped a notification while the app was fully closed" case —
  // `addNotificationResponseReceivedListener` below only fires for taps
  // that happen while this listener is already attached.
  useEffect(() => {
    if (hasCheckedLastResponseRef.current) return;
    hasCheckedLastResponseRef.current = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => openFromPushData(dataFromResponse(response)))
      .catch(() => {
        // Best-effort.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromPushData(dataFromResponse(response));
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request, router]);

  return null;
}
