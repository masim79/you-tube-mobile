import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { createComment, deleteComment, getComments, replyToComment, type Comment } from "../api/comments";
import { ApiError } from "../api/http";
import { type Page, useCursorPage } from "../api/pagination";
import { useApiClient } from "../api/useApiClient";
import { useAuth } from "../store/AuthContext";
import { useTheme } from "../theme/ThemeProvider";
import { Avatar } from "../ui/Avatar";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { TextField } from "../ui/TextField";
import { formatCompactNumber, formatRelativeTime, resolveMediaUrl } from "../ui/format";

type Sort = "top" | "new";

interface AuthorLabel {
  name: string;
  avatarUrl: string | null;
}

export interface CommentsSheetProps {
  visible: boolean;
  onClose: () => void;
  videoId: string;
  /** The uploading channel's id — lets a comment's owner-delete right be checked without a second lookup. */
  videoChannelId: string | null;
  commentCount: number;
  onCommentCountChange: (next: number) => void;
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Sign in to continue.";
    if (err.status === 429) return "Too many requests. Try again in a minute.";
  }
  return fallback;
}

/**
 * Comments bottom sheet (PLAN.md §17.1 "comments in a bottom sheet with
 * replies"): count, top/new sort (`GET /videos/{id}/comments?sort=`), a
 * composer, and a list with one level of replies — the mobile translation
 * of `vendor/you-tube/frontend/src/app/shared/comments/comment-item.ts`.
 *
 * Two contract gaps that file already documents are replicated honestly
 * here rather than worked around (see `src/api/comments.ts`'s own doc
 * comment for both):
 *  - **No "get a comment's replies" endpoint.** `repliesByCommentId` is a
 *    session-only cache seeded purely from this sheet's own successful
 *    `replyToComment` calls — correct while the sheet stays open, blank
 *    again next time it opens (reusing `visible` as the reset signal).
 *  - **`Comment` carries no display name/avatar.** The signed-in viewer's
 *    own comments show their real name/avatar from `AuthContext`; every
 *    other comment shows an honest "Member" placeholder.
 *
 * Unlike the idempotent like/dislike reaction (silent rollback), create/
 * reply/delete failures here are real, auth-gated, rate-limited actions —
 * errors surface via `Alert.alert` (the one error-surfacing primitive
 * already used elsewhere in this app, e.g. `VoiceSearchButton`; there is
 * no toast system on mobile yet) rather than being swallowed.
 */
export function CommentsSheet({
  visible,
  onClose,
  videoId,
  videoChannelId,
  commentCount,
  onCommentCountChange,
}: CommentsSheetProps) {
  const theme = useTheme();
  const client = useApiClient();
  const { user, isAuthenticated } = useAuth();

  const [sort, setSort] = useState<Sort>("top");
  const [repliesByCommentId, setRepliesByCommentId] = useState<Record<string, Comment[]>>({});
  const [composerText, setComposerText] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchPage = useCallback(
    (cursor: string | null): Promise<Page<Comment>> => getComments(client, videoId, { cursor, limit: 20, sort }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, videoId, sort]
  );

  const {
    items: comments,
    isLoading,
    isLoadingMore,
    error,
    reload,
    loadMore,
  } = useCursorPage<Comment>(fetchPage);

  useEffect(() => {
    if (!visible) return;
    setRepliesByCommentId({});
    void reload();
    // Re-run on open and whenever the sort changes while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, videoId, sort]);

  const isVideoOwnerChannel = !!videoChannelId && !!user?.channel_id && user.channel_id === videoChannelId;

  function canDelete(comment: Comment): boolean {
    if (!user) return false;
    const isOwnComment = !!comment.user_id && comment.user_id === user.id;
    const isAdmin = user.role === "admin" || user.role === "moderator";
    return isOwnComment || isVideoOwnerChannel || isAdmin;
  }

  function authorLabel(comment: Comment): AuthorLabel {
    const isOwnComment = !!user && !!comment.user_id && comment.user_id === user.id;
    if (isOwnComment) {
      return {
        name: user?.display_name ?? "You",
        avatarUrl: resolveMediaUrl(client.baseUrl, user?.avatar_path),
      };
    }
    return { name: "Member", avatarUrl: null };
  }

  async function postTopLevelComment(): Promise<void> {
    const body = composerText.trim();
    if (!body) return;
    if (!isAuthenticated) {
      Alert.alert("Sign in required", "Sign in to comment.");
      return;
    }
    setPosting(true);
    try {
      await createComment(client, videoId, body);
      setComposerText("");
      onCommentCountChange(commentCount + 1);
      await reload();
    } catch (err) {
      Alert.alert("Couldn't post comment", describeError(err, "Please try again."));
    } finally {
      setPosting(false);
    }
  }

  async function postReply(parentId: string, body: string): Promise<Comment | null> {
    try {
      const reply = await replyToComment(client, parentId, body);
      setRepliesByCommentId((prev) => ({ ...prev, [parentId]: [...(prev[parentId] ?? []), reply] }));
      onCommentCountChange(commentCount + 1);
      return reply;
    } catch (err) {
      Alert.alert("Couldn't post reply", describeError(err, "Please try again."));
      return null;
    }
  }

  async function removeComment(comment: Comment): Promise<void> {
    if (!comment.id) return;
    try {
      await deleteComment(client, comment.id);
      onCommentCountChange(Math.max(0, commentCount - 1));
      await reload();
    } catch (err) {
      Alert.alert("Couldn't delete comment", describeError(err, "Please try again."));
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`${formatCompactNumber(commentCount)} comment${commentCount === 1 ? "" : "s"}`}
      testID="comments-sheet"
    >
      <View style={[styles.sortRow, { paddingHorizontal: theme.spacing[4], marginBottom: theme.spacing[2] }]}>
        <Chip label="Top" active={sort === "top"} onPress={() => setSort("top")} testID="comments-sort-top" />
        <View style={{ width: theme.spacing[2] }} />
        <Chip label="New" active={sort === "new"} onPress={() => setSort("new")} testID="comments-sort-new" />
      </View>

      <View style={[styles.composer, { paddingHorizontal: theme.spacing[4] }]}>
        <TextField
          label="Add a comment"
          value={composerText}
          onChangeText={setComposerText}
          editable={!posting}
          multiline
          placeholder="Add a comment…"
          testID="comment-composer-input"
        />
        <View style={{ marginTop: theme.spacing[2], alignSelf: "flex-end" }}>
          <Button
            label="Comment"
            onPress={() => void postTopLevelComment()}
            loading={posting}
            disabled={!composerText.trim()}
            testID="comment-composer-submit"
          />
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: theme.spacing[4] }} color={theme.colors.accent} />
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item, index) => item.id ?? String(index)}
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              replies={repliesByCommentId[item.id ?? ""] ?? []}
              canDelete={canDelete(item)}
              authorLabel={authorLabel(item)}
              replyAuthorLabel={authorLabel}
              onReply={(body) => postReply(item.id ?? "", body)}
              onDelete={() => void removeComment(item)}
            />
          )}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          contentContainerStyle={{ paddingHorizontal: theme.spacing[4], paddingBottom: theme.spacing[6] }}
          ListEmptyComponent={
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[4] }}>
              No comments yet. Be the first.
            </Text>
          }
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: theme.spacing[3] }} />
            ) : undefined
          }
        />
      )}
      {error ? (
        <Text
          style={{
            color: theme.colors.accent,
            fontSize: theme.fontSize.sm,
            paddingHorizontal: theme.spacing[4],
            marginTop: theme.spacing[2],
          }}
        >
          Couldn't load comments.
        </Text>
      ) : null}
    </BottomSheet>
  );
}

function CommentRow({
  comment,
  replies,
  canDelete,
  authorLabel,
  replyAuthorLabel,
  onReply,
  onDelete,
}: {
  comment: Comment;
  replies: Comment[];
  canDelete: boolean;
  authorLabel: AuthorLabel;
  replyAuthorLabel: (reply: Comment) => AuthorLabel;
  onReply: (body: string) => Promise<Comment | null>;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [locallyDeleted, setLocallyDeleted] = useState(false);

  const isDeleted = locallyDeleted || comment.status === "deleted";

  async function submitReply(): Promise<void> {
    const body = replyText.trim();
    if (!body) return;
    setPostingReply(true);
    const result = await onReply(body);
    setPostingReply(false);
    if (result) {
      setReplyText("");
      setReplyOpen(false);
    }
  }

  return (
    <View style={{ flexDirection: "row", marginTop: theme.spacing[4] }}>
      <Avatar uri={authorLabel.avatarUrl} name={authorLabel.name} size={32} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: theme.spacing[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: "600" }}>
            {authorLabel.name}
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginLeft: theme.spacing[2] }}>
            {comment.created_at ? formatRelativeTime(new Date(comment.created_at)) : ""}
          </Text>
        </View>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}>
          {isDeleted ? "[deleted]" : comment.body ?? ""}
        </Text>

        {!isDeleted ? (
          <View style={{ flexDirection: "row", marginTop: theme.spacing[1] }}>
            <Pressable onPress={() => setReplyOpen((v) => !v)} hitSlop={6} accessibilityRole="button">
              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: "600" }}>
                Reply
              </Text>
            </Pressable>
            {canDelete ? (
              <Pressable
                onPress={() => {
                  setLocallyDeleted(true);
                  onDelete();
                }}
                hitSlop={6}
                accessibilityRole="button"
                style={{ marginLeft: theme.spacing[4] }}
              >
                <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: "600" }}>
                  Delete
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {replyOpen ? (
          <View style={{ marginTop: theme.spacing[2] }}>
            <TextField
              label="Reply"
              value={replyText}
              onChangeText={setReplyText}
              editable={!postingReply}
              multiline
              placeholder="Reply…"
            />
            <View style={{ flexDirection: "row", marginTop: theme.spacing[2] }}>
              <Button label="Reply" onPress={() => void submitReply()} loading={postingReply} disabled={!replyText.trim()} />
              <View style={{ width: theme.spacing[2] }} />
              <Button label="Cancel" variant="secondary" onPress={() => setReplyOpen(false)} />
            </View>
          </View>
        ) : null}

        {replies.length > 0 ? (
          <View
            style={{
              marginTop: theme.spacing[2],
              borderLeftWidth: 1,
              borderLeftColor: theme.colors.border,
              paddingLeft: theme.spacing[3],
            }}
          >
            {replies.map((reply, index) => {
              const label = replyAuthorLabel(reply);
              return (
                <View key={reply.id ?? index} style={{ flexDirection: "row", marginTop: index === 0 ? 0 : theme.spacing[2] }}>
                  <Avatar uri={label.avatarUrl} name={label.name} size={24} />
                  <View style={{ flex: 1, minWidth: 0, marginLeft: theme.spacing[2] }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.xs, fontWeight: "600" }}>
                        {label.name}
                      </Text>
                      <Text
                        style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginLeft: theme.spacing[2] }}
                      >
                        {reply.created_at ? formatRelativeTime(new Date(reply.created_at)) : ""}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.xs, marginTop: 2 }}>
                      {reply.body ?? ""}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sortRow: {
    flexDirection: "row",
  },
  composer: {
    marginBottom: 8,
  },
});
