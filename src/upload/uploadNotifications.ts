import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Upload progress notification (PLAN.md §17.1 "background upload, progress
 * notification", M1 chunk 7).
 *
 * **What this honestly delivers, and what it doesn't:**
 * `expo-notifications`' `NotificationContentInput` has no `setProgress`-style
 * determinate-progress-bar field (checked against the installed package's
 * `Notifications.types.d.ts` — Android's native `Notification.Builder
 * .setProgress()` isn't exposed), so this shows a plain notification whose
 * `body` text is replaced with the current percentage, not a native OS
 * progress bar. Rescheduling with the *same* `identifier` updates it in
 * place on both platforms rather than stacking a new notification per tick.
 *
 * This only keeps the notification itself alive — it does not make the
 * upload survive the app being backgrounded or killed any more than it
 * already does. `tusUpload.ts`'s resumability guarantee (a dropped request
 * resumes within the session) is unrelated to whether the OS has suspended
 * this app's JS; a fully backgrounded/killed app's JS stops running on both
 * iOS and Android the same way it would for any other long-lived fetch, and
 * closing that gap for real needs a native background-transfer module
 * (e.g. iOS's `URLSessionConfiguration.background` /
 * `WorkManager`-backed upload on Android) beyond what Expo's JS-only tus
 * client gives for free — not implemented here, documented rather than
 * silently shipped short, same as this chunk's other gaps.
 */
const UPLOAD_NOTIFICATION_ID = "hometube-upload-progress";
const ANDROID_CHANNEL_ID = "uploads";

let androidChannelReady = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || androidChannelReady) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Uploads",
    // LOW: visible and updates silently, no sound/vibration per progress tick.
    importance: Notifications.AndroidImportance.LOW,
  });
  androidChannelReady = true;
}

/** Best-effort — a denied/unavailable permission should never block the upload itself. */
export async function requestUploadNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export async function showUploadProgressNotification(title: string, percent: number): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: UPLOAD_NOTIFICATION_ID,
      content: {
        title,
        body: `Uploading… ${Math.round(percent)}%`,
        sticky: true,
        autoDismiss: false,
        sound: false,
      },
      trigger: Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : null,
    });
  } catch {
    // Non-fatal — see the file-header note.
  }
}

export async function showUploadDoneNotification(title: string, succeeded: boolean): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: UPLOAD_NOTIFICATION_ID,
      content: {
        title,
        body: succeeded ? "Upload complete." : "Upload failed.",
        sticky: false,
        autoDismiss: true,
        sound: false,
      },
      trigger: Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : null,
    });
  } catch {
    // Non-fatal.
  }
}

export async function dismissUploadNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(UPLOAD_NOTIFICATION_ID);
  } catch {
    // Non-fatal — may already be gone.
  }
}
