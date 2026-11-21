import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  endLiveStream,
  getChannelLiveStatus,
  issueLiveStreamKey,
  updateLiveChatSettings,
  type LiveStream,
  type LiveStreamKey,
} from "../../api/live";
import { ApiError } from "../../api/http";
import { useApiClient } from "../../api/useApiClient";
import { useAuth } from "../../store/AuthContext";
import { Button } from "../../ui/Button";
import { LoadingState } from "../../ui/LoadingState";
import { Screen } from "../../ui/Screen";
import { TextField } from "../../ui/TextField";
import { formatCompactNumber } from "../../ui/format";
import { useTheme } from "../../theme/ThemeProvider";

const SLOW_MODE_PRESETS_S = [0, 5, 10, 30, 60];

/**
 * "Go live" (PLAN.md §17.1's mobile "Live" row — Studio-lite's creator
 * side, M4 chunk 3). Scope decision, made against the contract rather than
 * assumed: §17.1 names this feature "go-live **notification**", not
 * "go live from the phone's camera" — and the contract itself has no
 * phone-as-broadcaster endpoint, only `issueLiveStreamKey` (an RTMP
 * key/URL for an external encoder) and `/channels/{id}/live/settings`
 * (slow mode). This screen is deliberately the light "find your stream
 * key, start OBS, monitor/end from here" surface the brief anticipated,
 * not an in-app camera-to-RTMP broadcaster — building the latter would be
 * inventing a server capability (an ingest endpoint for a phone's own
 * camera feed) that doesn't exist, not implementing a documented one.
 *
 * `issueLiveStreamKey`'s contract warns the key is "returned once ...
 * never again" — handled the same way a bearer token would be: shown
 * once in this screen's own state after a successful call, never
 * persisted, and gone the moment this screen unmounts. Rotating replaces
 * the previous key outright (not additive), so a "Reveal/rotate" action
 * always warns before firing it.
 */
export default function GoLiveScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { user } = useAuth();

  const channelId = user?.channel_id ?? null;

  const [loading, setLoading] = useState(true);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [issuedKey, setIssuedKey] = useState<LiveStreamKey | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [savingSlowMode, setSavingSlowMode] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!channelId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getChannelLiveStatus(client, channelId);
      setStream(result);
    } catch {
      setStream(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request, channelId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function rotateKey(): Promise<void> {
    if (!channelId) return;
    Alert.alert(
      "Rotate stream key?",
      "This replaces your current key — any encoder still using the old one will stop working.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Rotate",
          style: "destructive",
          onPress: async () => {
            setIssuing(true);
            try {
              const key = await issueLiveStreamKey(client, channelId);
              setIssuedKey(key);
            } catch (err) {
              Alert.alert("Couldn't issue a stream key", err instanceof ApiError ? err.message : "Please try again.");
            } finally {
              setIssuing(false);
            }
          },
        },
      ]
    );
  }

  async function changeSlowMode(nextS: number): Promise<void> {
    if (!channelId) return;
    setSavingSlowMode(true);
    try {
      const updated = await updateLiveChatSettings(client, channelId, nextS);
      setStream(updated);
    } catch (err) {
      Alert.alert("Couldn't update slow mode", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setSavingSlowMode(false);
    }
  }

  async function handleEndStream(): Promise<void> {
    if (!stream?.id) return;
    setEnding(true);
    try {
      const ended = await endLiveStream(client, stream.id);
      setStream(ended);
    } catch (err) {
      Alert.alert("Couldn't end stream", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setEnding(false);
    }
  }

  const isLive = stream?.status === "live";

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "fade" }} />
      <Screen>
        <View style={[styles.header, { marginBottom: theme.spacing[4] }]}>
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
            Go live
          </Text>
        </View>

        {!channelId ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
            You need a channel before you can go live.
          </Text>
        ) : loading ? (
          <LoadingState label="Checking your stream…" />
        ) : (
          <View style={{ gap: theme.spacing[4] }}>
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, padding: theme.spacing[4] },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>
                {isLive ? "You're live" : "Not live"}
              </Text>
              {isLive ? (
                <>
                  <Text
                    style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}
                  >
                    {formatCompactNumber(stream?.viewer_count ?? 0)} watching
                  </Text>
                  <View style={{ marginTop: theme.spacing[3], flexDirection: "row", gap: theme.spacing[2] }}>
                    <Button
                      label="Open live watch screen"
                      variant="secondary"
                      onPress={() =>
                        channelId &&
                        router.push({ pathname: "/live/[channelId]", params: { channelId } })
                      }
                      testID="go-live-open-watch"
                    />
                    <Button
                      label={ending ? "Ending…" : "End stream"}
                      onPress={() => void handleEndStream()}
                      loading={ending}
                      testID="go-live-end"
                    />
                  </View>
                </>
              ) : (
                <Text
                  style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}
                >
                  Start streaming from OBS (or another RTMP encoder) using the key below — this screen doesn't
                  broadcast your phone's own camera.
                </Text>
              )}
            </View>

            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, padding: theme.spacing[4] },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>
                RTMP stream key
              </Text>
              <Text
                style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}
              >
                Shown once, right after you rotate it — HomeTube never stores it in plaintext past issuance, so
                losing it means rotating a new one.
              </Text>

              {issuedKey ? (
                <View style={{ marginTop: theme.spacing[3] }}>
                  <TextField label="RTMP URL" value={issuedKey.rtmp_url ?? ""} editable={false} testID="go-live-rtmp-url" />
                  <View style={{ marginTop: theme.spacing[2] }}>
                    <TextField label="Stream key" value={issuedKey.stream_key ?? ""} editable={false} secureTextEntry testID="go-live-stream-key" />
                  </View>
                </View>
              ) : null}

              <View style={{ marginTop: theme.spacing[3] }}>
                <Button
                  label={issuing ? "Rotating…" : issuedKey ? "Rotate key" : "Reveal / rotate key"}
                  variant="secondary"
                  onPress={() => void rotateKey()}
                  loading={issuing}
                  testID="go-live-rotate-key"
                />
              </View>
            </View>

            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, padding: theme.spacing[4] },
              ]}
            >
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>
                Chat slow mode
              </Text>
              <Text
                style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}
              >
                Minimum seconds between messages per viewer. 0 disables it.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2], marginTop: theme.spacing[3] }}>
                {SLOW_MODE_PRESETS_S.map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => void changeSlowMode(preset)}
                    disabled={savingSlowMode}
                    accessibilityRole="button"
                    accessibilityLabel={preset === 0 ? "Off" : `${preset} seconds`}
                    testID={`go-live-slow-mode-${preset}`}
                    style={[
                      styles.pill,
                      {
                        borderRadius: theme.radius.pill,
                        borderColor: theme.colors.border,
                        backgroundColor:
                          (stream?.slow_mode_s ?? 0) === preset ? theme.colors.accent : theme.colors.surface,
                        opacity: savingSlowMode ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: (stream?.slow_mode_s ?? 0) === preset ? theme.colors.accentContrast : theme.colors.text,
                        fontSize: theme.fontSize.sm,
                        fontWeight: "600",
                      }}
                    >
                      {preset === 0 ? "Off" : `${preset}s`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
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
    paddingRight: 12,
    paddingVertical: 4,
  },
  card: {
    width: "100%",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
});
