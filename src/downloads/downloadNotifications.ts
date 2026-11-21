import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Download progress notification — the exact same pattern as
 * `src/upload/uploadNotifications.ts` (M1 chunk 7), reused rather than
 * reinvented per the task brief. Same honest limit applies: no native
 * determinate progress bar, just the `body` text replaced with the current
 * percentage on every reschedule of the *same* `identifier`.
 */
const DOWNLOAD_NOTIFICATION_ID = "hometube-download-progress";
const ANDROID_CHANNEL_ID = "downloads";

let androidChannelReady = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || androidChannelReady) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Downloads",
    importance: Notifications.AndroidImportance.LOW,
  });
  androidChannelReady = true;
}

/** Best-effort — a denied/unavailable permission should never block the download itself. */
export async function requestDownloadNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export async function showDownloadProgressNotification(title: string, percent: number): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: DOWNLOAD_NOTIFICATION_ID,
      content: {
        title,
        body: `Downloading… ${Math.round(percent)}%`,
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

export async function showDownloadDoneNotification(title: string, succeeded: boolean): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: DOWNLOAD_NOTIFICATION_ID,
      content: {
        title,
        body: succeeded ? "Download complete." : "Download failed.",
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

export async function dismissDownloadNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(DOWNLOAD_NOTIFICATION_ID);
  } catch {
    // Non-fatal — may already be gone.
  }
}
