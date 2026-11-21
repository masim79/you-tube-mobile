import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { registerDevice, unregisterDevice, type Device } from "../api/devices";
import type { ApiClient } from "../api/useApiClient";
import { CLIENT_VERSION } from "../constants/client";
import { ensureDefaultAndroidChannel } from "./androidChannels";

/**
 * Push registration (M3 chunk 1, PLAN.md §17.1/§17.6). Non-sensitive — the
 * registered device's own `id` (so logout can unregister the right row),
 * not a credential — so plain `AsyncStorage`, same reasoning
 * `store/recentSearches.ts` already documents for why that file isn't in
 * the keychain-backed `secureStorage.ts`.
 */
const DEVICE_ID_STORAGE_KEY = "ht_push_device_id";

async function getStoredDeviceId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function setStoredDeviceId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  } catch {
    // Best-effort — worst case logout can't find an id to unregister later.
  }
}

async function clearStoredDeviceId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}

/**
 * `Notifications.getExpoPushTokenAsync()` defaults to
 * `Constants.expoConfig.extra.eas.projectId` (checked against the
 * installed `expo-notifications` package's `Tokens.types.d.ts`) — EAS's
 * own project id, assigned by `eas init`/`eas build:configure` against a
 * real Expo account. `app.config.ts` has no `extra.eas` block at all
 * (confirmed by reading it — no `eas.projectId` anywhere), so there is no
 * value to read here. This is a deployment-account step this environment
 * cannot perform (no Expo account, and `eas init` needs network access to
 * Expo's servers), not a code bug: calling `getExpoPushTokenAsync()`
 * unconditionally would throw "No project ID found" every time rather than
 * failing gracefully, so this is checked explicitly and short-circuited
 * rather than let it throw.
 */
export function getEasProjectId(): string | null {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

export type PermissionOutcome = "granted" | "denied" | "undetermined";

/**
 * Requests push permission only if it hasn't already been decided one way
 * or the other — never re-prompts a user who already denied it (the OS
 * itself refuses to show the system dialog again on Android; on iOS a
 * second `requestPermissionsAsync()` call is a silent no-op returning the
 * existing `denied` status, so this check is for our own control flow,
 * not required to avoid an actual re-prompt, but makes the "don't keep
 * asking" intent explicit here rather than relying on platform behavior
 * alone).
 */
export async function ensurePushPermission(): Promise<PermissionOutcome> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return "granted";
  if (current.status === "denied" && !current.canAskAgain) return "denied";
  const requested = await Notifications.requestPermissionsAsync();
  if (requested.granted) return "granted";
  return requested.canAskAgain ? "undetermined" : "denied";
}

/**
 * Full registration flow: permission -> (Android) channel -> Expo push
 * token -> `POST /me/devices` -> store the returned device id locally.
 * Returns the registered `Device`, or `null` when any step can't complete
 * (permission denied, no EAS project id configured, or the request
 * failed) — every branch is non-fatal, matching the brief's "push is a
 * best-effort add-on" framing used on the server side too.
 */
export async function registerForPushNotifications(client: ApiClient): Promise<Device | null> {
  try {
    const permission = await ensurePushPermission();
    if (permission !== "granted") return null;

    await ensureDefaultAndroidChannel();

    const projectId = getEasProjectId();
    if (!projectId) {
      // See `getEasProjectId`'s doc comment — genuinely nothing to do
      // here until this app has a real EAS project id.
      return null;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!expoPushToken) return null;

    const device = await registerDevice(client, {
      expo_push_token: expoPushToken,
      platform: Platform.OS === "ios" ? "ios" : "android",
      app_version: CLIENT_VERSION,
    });
    if (device.id) {
      await setStoredDeviceId(device.id);
    }
    return device;
  } catch {
    // Best-effort — a push-registration failure must never block anything
    // else in the app.
    return null;
  }
}

/**
 * Unregisters this device, if one was ever registered this install. Called
 * from wherever logout is triggered in the UI (`src/app/(tabs)/you.tsx`),
 * not from `AuthContext.logout()` itself (left untouched per the task
 * brief) — must run *before* the caller clears the access token, since
 * `DELETE /me/devices/{id}` requires auth.
 */
export async function unregisterPushNotifications(client: ApiClient): Promise<void> {
  const deviceId = await getStoredDeviceId();
  if (!deviceId) return;
  try {
    await unregisterDevice(client, deviceId);
  } catch {
    // Best-effort — a shared/reset device losing its local id pointer
    // without the server row being cleaned up is a minor leak (a stale
    // row until Expo reports `DeviceNotRegistered`), not worth blocking
    // logout over.
  } finally {
    await clearStoredDeviceId();
  }
}
