import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { getStudioComments, moderateStudioComment, type StudioCommentAction, type StudioCommentStatus } from "../../api/studio";
import type { Comment } from "../../api/comments";
import { useApiClient } from "../../api/useApiClient";
import { useCursorPage, type Page } from "../../api/pagination";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { formatRelativeTime } from "../../ui/format";
import { Screen } from "../../ui/Screen";
import { useTheme } from "../../theme/ThemeProvider";

const STATUS_FILTERS: { value: StudioCommentStatus; label: string }[] = [
  { value: "held", label: "Held" },
  { value: "visible", label: "Visible" },
  { value: "deleted", label: "Deleted" },
];

/**
 * Comments moderation (PLAN.md §17.1 Studio-lite, M2 chunk 3) — mirrors
 * the web's `studio/comments/comments-page.ts` held-comment queue, plus a
 * status filter chip row (the web only ever shows `held`; this screen also
 * exposes `visible`/`deleted` per this chunk's own instructions) and the
 * full `pin/unpin/heart/unheart/hold/approve/delete` action set rather
 * than just approve/delete, since `moderateStudioComment` supports all 7.
 *
 * **Known contract gap, same one the web already flagged (not re-filed):**
 * `Comment` carries only `video_id` and `user_id`, no embedded video
 * title/thumbnail or author display name/avatar — there is no cheap
 * lookup for either. Each row therefore shows the honest "Member" /
 * "You (channel owner)" (`is_owner_reply`) placeholder and a "View video"
 * link by id, not a guessed title.
 */
export default function StudioCommentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();

  const [status, setStatus] = useState<StudioCommentStatus>("held");
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<Comment>> => getStudioComments(client, { status, cursor, limit: 24 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, status]
  );

  const { items, isLoading, isLoadingMore, error, reload, loadMore, hasMore, removeItem } = useCursorPage<Comment>(
    fetchPage
  );

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function setBusy(id: string, busy: boolean): void {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function moderate(comment: Comment, action: StudioCommentAction): Promise<void> {
    const id = comment.id;
    if (!id || busyIds.has(id)) return;
    setBusy(id, true);
    try {
      const updated = await moderateStudioComment(client, id, action);
      // An action that moves a comment out of the currently-filtered
      // status (approve while viewing "held", delete from any list, hold
      // while viewing "visible"...) should drop it from this list rather
      // than show a stale status locally — simplest correct behavior is
      // to just remove anything whose returned status no longer matches
      // the active filter, and otherwise leave it (pin/unpin/heart/unheart
      // don't change status at all).
      if (updated.status !== status) {
        removeItem((item) => item.id === id);
      }
    } catch {
      Alert.alert("Couldn't update comment", "Please try again.");
    } finally {
      setBusy(id, false);
    }
  }

  function confirmDelete(comment: Comment): void {
    Alert.alert("Delete this comment?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void moderate(comment, "delete") },
    ]);
  }

  function authorLabel(comment: Comment): string {
    return comment.is_owner_reply ? "You (channel owner)" : "Member";
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen>
        <View style={[styles.header, { marginBottom: theme.spacing[3] }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/you"))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.iconButton}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20 }}>←</Text>
          </Pressable>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", flex: 1 }}>
            Comments
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing[2], marginBottom: theme.spacing[3] }}>
          {STATUS_FILTERS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={status === option.value}
              onPress={() => setStatus(option.value)}
              testID={`studio-comments-filter-${option.value}`}
            />
          ))}
        </View>

        {isLoading && items.length === 0 ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>Loading…</Text>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: "center" }}>
              {error ? error.message : `No ${status} comments.`}
            </Text>
          </View>
        ) : (
          <FlatList
            testID="studio-comments-list"
            data={items}
            keyExtractor={(item, index) => item.id ?? String(index)}
            onEndReachedThreshold={0.5}
            onEndReached={() => hasMore && loadMore()}
            refreshing={isLoading}
            onRefresh={reload}
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing[3] }} />}
            ListFooterComponent={
              isLoadingMore ? (
                <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: "center", marginTop: theme.spacing[3] }}>
                  Loading more…
                </Text>
              ) : undefined
            }
            renderItem={({ item }) => {
              const busy = !!item.id && busyIds.has(item.id);
              return (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, padding: theme.spacing[3] },
                  ]}
                >
                  <View style={styles.row}>
                    <Avatar uri={null} name={authorLabel(item)} size={32} />
                    <View style={{ marginLeft: theme.spacing[2], flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing[2] }}>
                        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: "600" }}>
                          {authorLabel(item)}
                        </Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>
                          {item.created_at ? formatRelativeTime(new Date(item.created_at)) : ""}
                        </Text>
                        {item.is_pinned ? (
                          <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.xs, fontWeight: "600" }}>Pinned</Text>
                        ) : null}
                        {item.is_hearted ? <Text style={{ fontSize: theme.fontSize.xs }}>♥</Text> : null}
                      </View>
                      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}>
                        {item.body}
                      </Text>
                      <Pressable
                        onPress={() => item.video_id && router.push(`/watch/${item.video_id}`)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="View video"
                      >
                        <Text style={{ color: theme.colors.link, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
                          View video
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2], marginTop: theme.spacing[2] }}>
                    {item.status === "held" ? (
                      <Button label="Approve" onPress={() => void moderate(item, "approve")} disabled={busy} loading={busy} />
                    ) : null}
                    {item.status === "visible" ? (
                      <Button label="Hold" variant="secondary" onPress={() => void moderate(item, "hold")} disabled={busy} />
                    ) : null}
                    {item.status !== "deleted" ? (
                      <>
                        <Button
                          label={item.is_pinned ? "Unpin" : "Pin"}
                          variant="secondary"
                          onPress={() => void moderate(item, item.is_pinned ? "unpin" : "pin")}
                          disabled={busy}
                        />
                        <Button
                          label={item.is_hearted ? "Unheart" : "Heart"}
                          variant="secondary"
                          onPress={() => void moderate(item, item.is_hearted ? "unheart" : "heart")}
                          disabled={busy}
                        />
                        <Button label="Delete" variant="secondary" onPress={() => confirmDelete(item)} disabled={busy} />
                      </>
                    ) : null}
                  </View>
                </View>
              );
            }}
          />
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
  },
  card: {
    flexDirection: "column",
  },
});
