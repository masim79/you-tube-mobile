import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  updateSubscriptionLevel,
  subscribeToChannel,
  unsubscribeFromChannel,
  type NotificationLevel,
} from "../api/channels";
import { useApiClient } from "../api/useApiClient";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { useTheme } from "../theme/ThemeProvider";

const LEVELS: { value: NotificationLevel; label: string; hint: string }[] = [
  { value: "all", label: "All", hint: "Every upload and post" },
  { value: "personalized", label: "Personalized", hint: "A selection, picked for you" },
  { value: "none", label: "None", hint: "No notifications" },
];

export interface SubscribeControlProps {
  channelId: string;
  initialIsSubscribed: boolean;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  /** Lets the caller keep a displayed subscriber count roughly in sync (optional — optimistic, not re-fetched). */
  onSubscribedChange?: (isSubscribed: boolean) => void;
  testIDPrefix?: string;
}

/**
 * Subscribe/Unsubscribe toggle plus, once subscribed, a bell button that
 * opens the all/personalized/none notification-level picker (PLAN.md
 * §17.1 "subscribe with bell levels"; shape mirrors the web's
 * `subscription-level-menu.ts`, translated from a dropdown menu to a
 * bottom-sheet picker since this is a touch target, not a mouse hover
 * target). Shared by the Channel screen and the Watch screen's channel row
 * so there is exactly one subscribe control in the app, not two
 * inconsistent ones.
 *
 * Same "no GET for the current level" contract gap the web page already
 * lives with (see `src/api/channels.ts`'s `updateSubscriptionLevel` doc):
 * the picker always opens on `personalized` (the DB default) until the
 * viewer changes it this session — there is no way to ask the server what
 * it currently is.
 */
export function SubscribeControl({
  channelId,
  initialIsSubscribed,
  isAuthenticated,
  onRequireAuth,
  onSubscribedChange,
  testIDPrefix = "subscribe",
}: SubscribeControlProps) {
  const theme = useTheme();
  const client = useApiClient();

  const [isSubscribed, setIsSubscribed] = useState(initialIsSubscribed);
  const [pending, setPending] = useState(false);
  const [level, setLevel] = useState<NotificationLevel>("personalized");
  const [levelPending, setLevelPending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function toggleSubscribe(): Promise<void> {
    if (pending) return;
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const next = !isSubscribed;
    setIsSubscribed(next);
    onSubscribedChange?.(next);
    setPending(true);
    try {
      if (next) {
        await subscribeToChannel(client, channelId);
      } else {
        await unsubscribeFromChannel(client, channelId);
        setLevel("personalized"); // resets to the default picker state — see file-header doc comment.
      }
    } catch {
      setIsSubscribed(!next);
      onSubscribedChange?.(!next);
    } finally {
      setPending(false);
    }
  }

  async function chooseLevel(next: NotificationLevel): Promise<void> {
    setPickerOpen(false);
    if (next === level || levelPending) return;
    const previous = level;
    setLevel(next);
    setLevelPending(true);
    try {
      const result = await updateSubscriptionLevel(client, channelId, next);
      setLevel(result.notification_level ?? next);
    } catch {
      setLevel(previous);
      Alert.alert("Couldn't update notifications", "Please try again.");
    } finally {
      setLevelPending(false);
    }
  }

  return (
    <View style={styles.row}>
      <Button
        label={isSubscribed ? "Subscribed" : "Subscribe"}
        variant={isSubscribed ? "secondary" : "primary"}
        disabled={pending}
        onPress={toggleSubscribe}
        testID={`${testIDPrefix}-button`}
      />

      {isSubscribed ? (
        <Pressable
          onPress={() => setPickerOpen(true)}
          disabled={levelPending}
          accessibilityRole="button"
          accessibilityLabel="Notification settings for this channel"
          testID={`${testIDPrefix}-bell`}
          style={({ pressed }) => [
            styles.bell,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.pill,
              marginLeft: theme.spacing[2],
              opacity: levelPending ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={{ fontSize: theme.fontSize.md }}>🔔</Text>
        </Pressable>
      ) : null}

      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Notifications">
        {LEVELS.map((item) => (
          <Pressable
            key={item.value}
            onPress={() => void chooseLevel(item.value)}
            accessibilityRole="button"
            testID={`${testIDPrefix}-level-${item.value}`}
            style={({ pressed }) => [
              styles.levelRow,
              {
                paddingHorizontal: theme.spacing[4],
                paddingVertical: theme.spacing[3],
                backgroundColor: pressed ? theme.colors.surfaceHover : "transparent",
              },
            ]}
          >
            <View>
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>
                {item.label}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>{item.hint}</Text>
            </View>
            {item.value === level ? (
              <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.md, fontWeight: "700" }}>✓</Text>
            ) : null}
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  bell: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
