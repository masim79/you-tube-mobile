import React, { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { deleteLiveChatMessage, type LiveChatMessage } from "../api/live";
import { ApiError } from "../api/http";
import { useApiClient } from "../api/useApiClient";
import { useLiveChat } from "./useLiveChat";
import { Avatar } from "../ui/Avatar";
import { TextField } from "../ui/TextField";
import { formatRelativeTime } from "../ui/format";
import { useTheme } from "../theme/ThemeProvider";

export interface LiveChatPanelProps {
  streamId: string;
  /** Only connect/fetch while the stream itself is actually `live` — an ended/offline stream has no socket to join. */
  enabled: boolean;
  /** Stream owner or a channel moderator (PLAN.md §20.2 role matrix) — mirrors `CommentsSheet`'s own `canDelete` check (owner-channel or global admin/moderator role), there being no per-channel moderator list in the contract. */
  canModerate: boolean;
  /** `LiveStream.slow_mode_s` — `0` disables it. Drives the composer's own cooldown so a normal sender rarely hits the server's hard slow-mode rejection (a close frame, not a soft error — see `useLiveChat`'s doc comment) in the first place. */
  slowModeS: number;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  testIDPrefix?: string;
}

function connectionLabel(state: ReturnType<typeof useLiveChat>["connectionState"]): string | null {
  if (state === "open") return null;
  if (state === "connecting") return "Connecting to chat…";
  if (state === "reconnecting") return "Reconnecting…";
  return "Chat is offline.";
}

/**
 * Live chat (PLAN.md §17.1 "Live": "watch a live stream, live chat").
 * Message list fed by `useLiveChat`'s WebSocket client, a send box with a
 * client-side slow-mode cooldown, and a moderation delete for the stream
 * owner/a moderator. Deliberately plain — not `CommentsSheet`'s bottom
 * sheet, since live chat is meant to sit alongside the always-visible
 * video, not be opened on demand.
 */
export function LiveChatPanel({
  streamId,
  enabled,
  canModerate,
  slowModeS,
  isAuthenticated,
  onRequireAuth,
  testIDPrefix = "live-chat",
}: LiveChatPanelProps) {
  const theme = useTheme();
  const client = useApiClient();
  const { messages, connectionState, backlogError, sendMessage, applyLocalDelete } = useLiveChat(
    client,
    streamId,
    enabled
  );

  const [draft, setDraft] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const listRef = useRef<FlatList<LiveChatMessage>>(null);

  // Re-renders once a second only while a cooldown is actually counting
  // down — not an always-on interval, so the panel is idle the rest of the time.
  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (cooldownUntil && nowTick >= cooldownUntil) setCooldownUntil(null);
  }, [cooldownUntil, nowTick]);

  useEffect(() => {
    // New message arrived — scroll to the latest, same "stick to bottom"
    // behavior as every chat UI; no attempt to preserve scroll position
    // for someone deliberately scrolled up to re-read history (out of
    // scope for this chunk's "minimal wiring" framing).
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const cooldownRemainingS = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - nowTick) / 1000)) : 0;
  const canSend = connectionState === "open" && !cooldownRemainingS && draft.trim().length > 0;

  function submit(): void {
    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }
    const body = draft.trim();
    if (!body) return;
    const sent = sendMessage(body);
    if (!sent) return;
    setDraft("");
    if (slowModeS > 0) setCooldownUntil(Date.now() + slowModeS * 1000);
  }

  async function removeMessage(message: LiveChatMessage): Promise<void> {
    if (!message.id) return;
    applyLocalDelete(message.id);
    try {
      await deleteLiveChatMessage(client, message.id);
    } catch (err) {
      // The optimistic delete above already hid it locally; a failure here
      // just means it'll reappear for everyone else too, which the owner
      // can retry — not rolled back locally to avoid a confusing flash.
      const message2 = err instanceof ApiError ? err.message : "Please try again.";
      Alert.alert("Couldn't delete message", message2);
    }
  }

  const banner = connectionLabel(connectionState);

  return (
    <View testID={testIDPrefix} style={styles.container}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item, index) => item.id ?? String(index)}
        style={styles.list}
        contentContainerStyle={{ paddingHorizontal: theme.spacing[4], paddingVertical: theme.spacing[2] }}
        renderItem={({ item }) => (
          <View style={[styles.row, { marginTop: theme.spacing[2] }]}>
            <Avatar uri={null} name={item.display_name ?? "?"} size={24} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: theme.spacing[2] }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.xs, fontWeight: "600" }} numberOfLines={1}>
                  {item.display_name ?? "Viewer"}
                </Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginLeft: theme.spacing[2] }}>
                  {item.created_at ? formatRelativeTime(new Date(item.created_at)) : ""}
                </Text>
              </View>
              <Text style={{ color: item.is_deleted ? theme.colors.textSecondary : theme.colors.text, fontSize: theme.fontSize.sm, marginTop: 2 }}>
                {item.is_deleted ? "Message deleted" : item.body ?? ""}
              </Text>
            </View>
            {!item.is_deleted && canModerate ? (
              <Pressable
                onPress={() => void removeMessage(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Delete message"
                testID={`${testIDPrefix}-delete-${item.id}`}
              >
                <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: "600" }}>
                  Delete
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
            {backlogError ? "Couldn't load chat." : "No messages yet — say hi."}
          </Text>
        }
      />

      {banner ? (
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            paddingHorizontal: theme.spacing[4],
            marginBottom: theme.spacing[1],
          }}
          testID={`${testIDPrefix}-status`}
        >
          {banner}
        </Text>
      ) : null}

      <View style={[styles.composer, { paddingHorizontal: theme.spacing[4], paddingBottom: theme.spacing[4] }]}>
        <TextField
          label="Say something"
          value={draft}
          onChangeText={setDraft}
          placeholder={
            cooldownRemainingS > 0
              ? `Slow mode: wait ${cooldownRemainingS}s`
              : isAuthenticated
                ? "Say something…"
                : "Sign in to chat"
          }
          editable={isAuthenticated && connectionState === "open"}
          onSubmitEditing={submit}
          testID={`${testIDPrefix}-input`}
        />
        <View style={{ marginTop: theme.spacing[2], alignSelf: "flex-end" }}>
          <Pressable
            onPress={submit}
            disabled={!isAuthenticated ? false : !canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            testID={`${testIDPrefix}-send`}
            style={{ opacity: !isAuthenticated ? 1 : canSend ? 1 : 0.5 }}
          >
            <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.md, fontWeight: "700" }}>
              {isAuthenticated ? "Send" : "Sign in"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  composer: {
    borderTopWidth: 0,
  },
});
