import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../../../api/useApiClient";
import {
  deleteVideo,
  getVideo,
  setThumbnail,
  studioThumbnailCandidatePath,
  updateVideo,
  type Video,
  type Visibility,
} from "../../../../api/videos";
import { Button } from "../../../../ui/Button";
import { Chip } from "../../../../ui/Chip";
import { resolveMediaUrl } from "../../../../ui/format";
import { LoadingState } from "../../../../ui/LoadingState";
import { Screen } from "../../../../ui/Screen";
import { TextField } from "../../../../ui/TextField";
import { useTheme } from "../../../../theme/ThemeProvider";

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
];

const THUMBNAIL_CANDIDATES = [0, 1, 2] as const;

/**
 * Edit screen (PLAN.md §17.1 Studio-lite, M2 chunk 3) — mirrors the web's
 * `studio/content/video-edit-panel.ts`, minus the fields out of scope for
 * the deliberately-light mobile subset: no scheduling (`scheduled_at`/
 * `scheduled_publish_as`), no chapters/end-screens/cards/trim editors
 * (R3-P6, web-only per this chunk's instructions). A dedicated form rather
 * than reusing `UploadDetailsForm` — that form also carries `category` and
 * `isShort`, neither of which `updateVideo`'s request body accepts
 * (openapi.yaml's `PATCH /videos/{id}` has no `category`/`is_short`
 * properties), so reusing it would silently offer controls that save
 * nothing.
 */
export default function EditVideoScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [video, setVideo] = useState<Video | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [saving, setSaving] = useState(false);
  const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const fetched = await getVideo(client, id);
      setVideo(fetched);
      setTitle(fetched.title ?? "");
      setDescription(fetched.description ?? "");
      setTagsInput((fetched.tags ?? []).join(", "));
      // "scheduled" is a server-driven state (R2-P2), not a choice this
      // form offers — a video currently scheduled keeps its visibility
      // selector on "private" until it actually publishes, same as the
      // web's own fallback when `publishMode` can't represent it.
      setVisibility(fetched.visibility === "scheduled" ? "private" : fetched.visibility ?? "private");
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause : new Error("Failed to load"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isTitleValid = title.trim().length > 0;

  async function save(): Promise<void> {
    if (!id || !isTitleValid || saving) return;
    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const updated = await updateVideo(client, id, {
        title: title.trim(),
        description: description.trim(),
        tags,
        visibility,
      });
      setVideo(updated);
      Alert.alert("Saved", "Your changes were saved.");
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseCandidate(candidate: 0 | 1 | 2): Promise<void> {
    if (!id || thumbnailBusy) return;
    setThumbnailBusy(true);
    try {
      const updated = await setThumbnail(client, id, { candidate });
      setVideo(updated);
    } catch {
      Alert.alert("Couldn't update thumbnail", "Please try again.");
    } finally {
      setThumbnailBusy(false);
    }
  }

  async function uploadCustomThumbnail(): Promise<void> {
    if (!id || thumbnailBusy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "HomeTube needs access to your photo library to pick a thumbnail.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    setThumbnailBusy(true);
    try {
      const updated = await setThumbnail(client, id, {
        file: {
          uri: asset.uri,
          name: asset.fileName ?? `thumbnail-${Date.now()}.jpg`,
          type: asset.mimeType ?? "image/jpeg",
        },
      });
      setVideo(updated);
    } catch {
      Alert.alert("Couldn't upload that thumbnail", "Please try again.");
    } finally {
      setThumbnailBusy(false);
    }
  }

  function confirmDelete(): void {
    if (!id) return;
    Alert.alert("Delete this video?", "This permanently deletes the video and its media files. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteVideo(client, id);
            router.replace("/you/videos");
          } catch {
            setDeleting(false);
            Alert.alert("Couldn't delete", "Please try again.");
          }
        },
      },
    ]);
  }

  if (!video && !loadError) {
    return <LoadingState label="Loading…" />;
  }

  if (!video) {
    return (
      <Screen centered>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: "center" }}>
          {loadError?.message ?? "Could not load this video."}
        </Text>
      </Screen>
    );
  }

  const currentThumbnailUrl = resolveMediaUrl(client.baseUrl, video.thumbnail_path);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen>
        <View style={[styles.header, { marginBottom: theme.spacing[3] }]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/you/videos"))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.iconButton}
          >
            <Text style={{ color: theme.colors.text, fontSize: 20 }}>←</Text>
          </Pressable>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", flex: 1 }} numberOfLines={1}>
            Edit video
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: theme.spacing[4] }}>
            <TextField label="Title" value={title} onChangeText={setTitle} maxLength={100} testID="edit-title" />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              testID="edit-description"
            />
            <TextField
              label="Tags (comma-separated)"
              value={tagsInput}
              onChangeText={setTagsInput}
              autoCapitalize="none"
              testID="edit-tags"
            />

            <View>
              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing[2] }}>
                Visibility
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
                {VISIBILITY_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    active={visibility === option.value}
                    onPress={() => setVisibility(option.value)}
                    testID={`edit-visibility-${option.value}`}
                  />
                ))}
              </View>
            </View>

            <Button
              label={saving ? "Saving…" : "Save changes"}
              onPress={() => void save()}
              disabled={!isTitleValid || saving}
              loading={saving}
              testID="edit-save"
            />

            <Button
              label="View insights"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/you/videos/[id]/insights",
                  params: { id: video.id ?? "", title: video.title ?? "", thumbnail: video.thumbnail_path ?? "" },
                })
              }
              testID="edit-view-insights"
            />

            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing[4], gap: theme.spacing[3] }}>
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>Thumbnail</Text>

              {currentThumbnailUrl ? (
                <View>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginBottom: theme.spacing[1] }}>
                    Current
                  </Text>
                  <View
                    style={[
                      styles.currentThumbnailWrap,
                      { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md },
                    ]}
                  >
                    <Image source={{ uri: currentThumbnailUrl }} style={styles.thumbnail} accessibilityIgnoresInvertColors />
                  </View>
                </View>
              ) : null}

              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>Choose a different thumbnail</Text>
              <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
                {THUMBNAIL_CANDIDATES.map((candidate) => (
                  <Pressable
                    key={candidate}
                    onPress={() => void chooseCandidate(candidate)}
                    disabled={thumbnailBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Use thumbnail option ${candidate + 1}`}
                    testID={`edit-thumbnail-candidate-${candidate}`}
                    style={[
                      styles.candidateWrap,
                      {
                        backgroundColor: theme.colors.surfaceRaised,
                        borderRadius: theme.radius.sm,
                        borderColor: theme.colors.border,
                        opacity: thumbnailBusy ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: resolveMediaUrl(client.baseUrl, studioThumbnailCandidatePath(video.id ?? "", candidate))! }}
                      style={styles.thumbnail}
                      accessibilityIgnoresInvertColors
                    />
                  </Pressable>
                ))}
              </View>

              <Button
                label={thumbnailBusy ? "Uploading…" : "Upload a custom thumbnail"}
                onPress={() => void uploadCustomThumbnail()}
                variant="secondary"
                disabled={thumbnailBusy}
                loading={thumbnailBusy}
                testID="edit-thumbnail-upload"
              />
            </View>

            <View style={{ alignItems: "center", marginTop: theme.spacing[4] }}>
              <Button
                label={deleting ? "Deleting…" : "Delete this video"}
                onPress={confirmDelete}
                variant="secondary"
                disabled={deleting}
                loading={deleting}
                testID="edit-delete"
              />
            </View>
          </View>
        </ScrollView>
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
  currentThumbnailWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
  },
  candidateWrap: {
    flex: 1,
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderWidth: 1,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
});
