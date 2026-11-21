import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getCategories, type Category } from "../../api/discovery";
import { useApiClient } from "../../api/useApiClient";
import { getVideoForUpload } from "../../api/videos";
import { useAuth } from "../../store/AuthContext";
import { useTheme } from "../../theme/ThemeProvider";
import { Button } from "../../ui/Button";
import { formatFileSize } from "../../ui/format";
import { LoadingState } from "../../ui/LoadingState";
import { Screen } from "../../ui/Screen";
import {
  INITIAL_DETAILS_VALUE,
  UploadDetailsForm,
  type UploadDetailsValue,
} from "../../upload/UploadDetailsForm";
import { useTusUpload, type RnUploadFile, type UploadMetadata } from "../../upload/tusUpload";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_GB } from "../../upload/uploadConstants";
import {
  dismissUploadNotification,
  requestUploadNotificationPermission,
  showUploadDoneNotification,
  showUploadProgressNotification,
} from "../../upload/uploadNotifications";

/**
 * `/create` tab (PLAN.md §17.1's "Create/Upload" row, M1 chunk 7 — the last
 * M1 chunk). Mirrors the web's upload flow
 * (`vendor/you-tube/frontend/src/app/pages/upload/upload-page.ts`) with a
 * mobile-shaped source step first: pick an existing video from the camera
 * roll (`expo-image-picker`) or record one in-app (`expo-camera`'s
 * `CameraView.recordAsync`, already installed for the setup QR scanner —
 * here used in its documented video-recording mode instead of barcode
 * scanning), then the same details form → resumable tus upload →
 * `GET /uploads/{tus_upload_id}/video` resolve loop the web uses.
 *
 * **Deliberate choice, documented per this chunk's own instructions:** once
 * `video_id` resolves, this screen navigates straight to `/watch/[id]`
 * (`router.replace`) rather than building a second "processing…" view here
 * — `WatchScreen` (M1 chunk 4) already polls `GET /videos/{id}` until
 * `ready`/`failed` and renders exactly that state, so duplicating it here
 * would be a second copy of the same state machine to keep in sync.
 *
 * See `src/upload/tusUpload.ts` and `src/upload/uploadNotifications.ts`
 * for the two biggest documented gaps against the web/spec: no
 * resume-after-app-relaunch, and no true backgrounded/killed-app transfer
 * (the progress notification keeps showing while this screen's JS is
 * still running, not longer than that).
 */

type Stage =
  | { kind: "channel-error" }
  | { kind: "choose" }
  | { kind: "recording" }
  | { kind: "details"; file: RnUploadFile }
  | { kind: "uploading"; file: RnUploadFile }
  | { kind: "resolving" }
  | { kind: "resolve-timeout" };

const RESOLVE_RETRY_COUNT = 6;
const RESOLVE_RETRY_DELAY_MS = 2000;

function fileFromImagePickerAsset(asset: ImagePicker.ImagePickerAsset): RnUploadFile {
  return {
    uri: asset.uri,
    name: asset.fileName ?? `video-${Date.now()}.mp4`,
    type: asset.mimeType ?? "video/mp4",
    size: asset.fileSize,
  };
}

export default function CreateScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { user, accessToken } = useAuth();
  const upload = useTusUpload();

  const [stage, setStage] = useState<Stage>(user?.channel_id ? { kind: "choose" } : { kind: "channel-error" });
  const [details, setDetails] = useState<UploadDetailsValue>(INITIAL_DETAILS_VALUE);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

  const cameraRef = useRef<CameraView>(null);
  /** Last 5%-bucket the progress notification was updated at — avoids rescheduling it on every `onProgress` tick. */
  const lastNotifiedBucketRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    getCategories(client)
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => undefined); // non-fatal — the category chip row just stays empty.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request]);

  const resolveVideoId = useCallback(
    async (tusUploadId: string) => {
      for (let attempt = 0; attempt < RESOLVE_RETRY_COUNT; attempt++) {
        try {
          const { video_id } = await getVideoForUpload(client, tusUploadId);
          router.replace(`/watch/${video_id}`);
          return;
        } catch {
          if (attempt < RESOLVE_RETRY_COUNT - 1) {
            await new Promise((resolve) => setTimeout(resolve, RESOLVE_RETRY_DELAY_MS));
          }
        }
      }
      setStage({ kind: "resolve-timeout" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, router]
  );

  // React to the tus upload's own state machine — only while this screen
  // is actually showing the "uploading" stage, mirroring the web's guard
  // in `upload-page.ts`'s constructor effect.
  useEffect(() => {
    if (stage.kind !== "uploading") return;
    const { phase, bytesUploaded, bytesTotal, tusUploadId, errorMessage } = upload.state;
    const uploadingTitle = details.title.trim() || "Your video";

    if (phase === "uploading" && bytesTotal > 0) {
      const percent = Math.min(100, (bytesUploaded / bytesTotal) * 100);
      const bucket = Math.floor(percent / 5);
      if (bucket !== lastNotifiedBucketRef.current) {
        lastNotifiedBucketRef.current = bucket;
        void showUploadProgressNotification(uploadingTitle, percent);
      }
      return;
    }

    if (phase === "succeeded") {
      void showUploadDoneNotification(uploadingTitle, true);
      if (!tusUploadId) {
        setStage({ kind: "resolve-timeout" });
        return;
      }
      setStage({ kind: "resolving" });
      void resolveVideoId(tusUploadId);
      return;
    }

    if (phase === "error") {
      void showUploadDoneNotification(uploadingTitle, false);
      setFileError(errorMessage ?? "The upload failed. Please try again.");
      setStage({ kind: "details", file: stage.file });
      return;
    }

    if (phase === "canceled") {
      void dismissUploadNotification();
      setStage({ kind: "details", file: stage.file });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload.state, stage, resolveVideoId]);

  function resetToChoose(): void {
    setStage(user?.channel_id ? { kind: "choose" } : { kind: "channel-error" });
    setDetails(INITIAL_DETAILS_VALUE);
    setFileError(null);
  }

  async function pickFromLibrary(): Promise<void> {
    setFileError(null);
    let permission = libraryPermission;
    if (!permission?.granted) {
      permission = await requestLibraryPermission();
    }
    if (!permission?.granted) {
      setFileError("HomeTube needs access to your photo library to pick a video.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"] });
    if (result.canceled || !result.assets?.length) return;

    const file = fileFromImagePickerAsset(result.assets[0]);
    if (file.size && file.size > MAX_UPLOAD_BYTES) {
      setFileError(`This file is larger than the ${MAX_UPLOAD_GB} GB upload limit.`);
      return;
    }
    setStage({ kind: "details", file });
  }

  async function enterRecording(): Promise<void> {
    setFileError(null);
    let cam = cameraPermission;
    if (!cam?.granted) cam = await requestCameraPermission();
    let mic = micPermission;
    if (!mic?.granted) mic = await requestMicPermission();
    if (!cam?.granted || !mic?.granted) {
      setFileError("HomeTube needs camera and microphone access to record a video.");
      return;
    }
    setStage({ kind: "recording" });
  }

  async function startRecording(): Promise<void> {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    try {
      // Saved to the cache directory by expo-camera itself (its own doc
      // comment on `recordAsync`) — fine here since the file is read once,
      // immediately, as a tus upload source, not kept as a user asset the
      // OS reclaiming its cache would make disappear (PLAN.md §17.7's
      // "downloads go in documents, not cache" rule is about the offline
      // *library*, a different feature, not this transient recording).
      const result = await cameraRef.current.recordAsync();
      setIsRecording(false);
      if (!result?.uri) {
        setStage({ kind: "choose" });
        return;
      }
      let size: number | undefined;
      try {
        size = new File(result.uri).size ?? undefined;
      } catch {
        size = undefined;
      }
      if (size && size > MAX_UPLOAD_BYTES) {
        setFileError(`This recording is larger than the ${MAX_UPLOAD_GB} GB upload limit.`);
        setStage({ kind: "choose" });
        return;
      }
      setStage({
        kind: "details",
        file: { uri: result.uri, name: `recording-${Date.now()}.mp4`, type: "video/mp4", size },
      });
    } catch {
      setIsRecording(false);
      setFileError("Recording failed. Please try again.");
      setStage({ kind: "choose" });
    }
  }

  function stopRecording(): void {
    cameraRef.current?.stopRecording();
  }

  async function startUpload(file: RnUploadFile): Promise<void> {
    if (!client.baseUrl || !accessToken || !user?.channel_id || !details.title.trim()) return;

    void requestUploadNotificationPermission();
    lastNotifiedBucketRef.current = -1;

    const normalizedTags = details.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .join(",");

    const metadata: UploadMetadata = {
      channel_id: user.channel_id,
      title: details.title.trim(),
      filename: file.name,
      filetype: file.type,
      description: details.description.trim() || undefined,
      tags: normalizedTags || undefined,
      category: details.category ?? undefined,
      visibility: details.visibility,
      is_short: details.isShort ? "true" : "false",
    };

    setStage({ kind: "uploading", file });
    upload.start({ baseUrl: client.baseUrl, accessToken, file, metadata });
  }

  function cancelUpload(): void {
    upload.cancel();
  }

  if (stage.kind === "channel-error") {
    return (
      <Screen centered>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, textAlign: "center" }}>
          Your account has no channel to upload to yet. Set one up from the web app first.
        </Text>
      </Screen>
    );
  }

  if (stage.kind === "choose") {
    return (
      <Screen centered>
        <View style={{ gap: theme.spacing[4], width: "100%" }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", textAlign: "center" }}>
            Create
          </Text>
          <Button label="Choose from library" onPress={() => void pickFromLibrary()} testID="create-pick-library" />
          <Button label="Record video" onPress={() => void enterRecording()} variant="secondary" testID="create-record" />
          {fileError ? (
            <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.sm, textAlign: "center" }}>{fileError}</Text>
          ) : null}
        </View>
      </Screen>
    );
  }

  if (stage.kind === "recording") {
    return (
      <View style={styles.flex}>
        <CameraView ref={cameraRef} style={styles.flex} facing="back" mode="video" />
        <View style={[styles.recordOverlay, { backgroundColor: theme.colors.surface }]}>
          <Pressable
            onPress={() => void (isRecording ? stopRecording() : startRecording())}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
            style={[
              styles.recordButton,
              {
                borderColor: theme.colors.text,
                backgroundColor: isRecording ? theme.colors.accent : "transparent",
              },
            ]}
          >
            <View
              style={[
                styles.recordDot,
                { backgroundColor: isRecording ? theme.colors.accentContrast : theme.colors.accent },
              ]}
            />
          </Pressable>
          <Pressable onPress={() => setStage({ kind: "choose" })} hitSlop={12} disabled={isRecording}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                marginTop: theme.spacing[3],
                opacity: isRecording ? 0.4 : 1,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (stage.kind === "resolving") {
    return <LoadingState label="Finishing up…" />;
  }

  if (stage.kind === "resolve-timeout") {
    return (
      <Screen centered>
        <View style={{ gap: theme.spacing[4] }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, textAlign: "center" }}>
            Your video uploaded, but it&apos;s taking longer than usual to appear. Check your channel again in a
            minute.
          </Text>
          <Button label="Upload another video" onPress={resetToChoose} testID="upload-another" />
        </View>
      </Screen>
    );
  }

  // stage.kind is "details" or "uploading" here — both carry `file`.
  const file = stage.file;
  const isUploading = stage.kind === "uploading";
  const percent = upload.state.bytesTotal > 0 ? Math.min(100, (upload.state.bytesUploaded / upload.state.bytesTotal) * 100) : 0;
  const canStart = details.title.trim().length > 0;

  return (
    <Screen>
      <View style={{ marginBottom: theme.spacing[4] }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }} numberOfLines={1}>
          {file.name}
        </Text>
        {file.size ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
            {formatFileSize(file.size)}
          </Text>
        ) : null}
      </View>

      {isUploading ? (
        <View style={[styles.statusBox, { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md }]}>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.border, borderRadius: theme.radius.sm }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${percent}%`, backgroundColor: theme.colors.accent, borderRadius: theme.radius.sm },
              ]}
            />
          </View>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sm, marginTop: theme.spacing[2] }}>
            {Math.round(percent)}% · {formatFileSize(upload.state.bytesUploaded)} / {formatFileSize(upload.state.bytesTotal)}
          </Text>
          <View style={{ marginTop: theme.spacing[4] }}>
            <Button label="Cancel" onPress={cancelUpload} variant="secondary" testID="upload-cancel" />
          </View>
        </View>
      ) : (
        <>
          <UploadDetailsForm value={details} onChange={setDetails} categories={categories} />
          {fileError ? (
            <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.sm, marginTop: theme.spacing[3] }}>
              {fileError}
            </Text>
          ) : null}
          <View style={{ marginTop: theme.spacing[4] }}>
            <Button label="Upload" onPress={() => void startUpload(file)} disabled={!canStart} testID="upload-start" />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  recordOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: 24,
    opacity: 0.94,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  recordDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
  },
  statusBox: {
    padding: 16,
  },
  progressTrack: {
    height: 8,
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
  },
});
