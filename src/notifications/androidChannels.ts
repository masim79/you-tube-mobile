import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * M3 chunk 1's "OS-level quiet handling" (PLAN.md §17.1): mostly a platform
 * capability, not app code. Android ignores system Do-Not-Disturb/quiet-
 * hours settings for a notification posted with no channel — a channel is
 * also what gives a user a per-app, per-category mute/importance control
 * in the Android notification settings UI. iOS has no channel concept;
 * its Focus/quiet-hours handling is automatic once permission is granted,
 * nothing to build there.
 *
 * This is deliberately a separate, DEFAULT-importance channel from the
 * LOW-importance "uploads"/"downloads" progress channels
 * `src/upload/uploadNotifications.ts` / `src/downloads/downloadNotifications.ts`
 * already set up — those are silent, self-dismissing progress ticks for an
 * action the user just started themselves; this one is unsolicited remote
 * content (a new upload from a channel you follow, a reply, a mention)
 * that should behave like a normal notification (sound, appears in the
 * shade) and be user-tunable independently of those.
 */
export const DEFAULT_ANDROID_CHANNEL_ID = "default";

let ready = false;

export async function ensureDefaultAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || ready) return;
  await Notifications.setNotificationChannelAsync(DEFAULT_ANDROID_CHANNEL_ID, {
    name: "General",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  ready = true;
}
