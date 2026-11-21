import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../../../api/useApiClient";
import { getStudioAnalytics, type AnalyticsDailyPoint, type AnalyticsSummary, type RetentionPoint } from "../../../../api/studio";
import { Chip } from "../../../../ui/Chip";
import { LoadingState } from "../../../../ui/LoadingState";
import { Screen } from "../../../../ui/Screen";
import { dateRangeForPreset, formatCompactNumber, formatDuration, formatWatchTime, resolveMediaUrl } from "../../../../ui/format";
import { useTheme } from "../../../../theme/ThemeProvider";
import type { NativeTheme } from "../../../../theme";

type RangePreset = 7 | 28 | 90;

const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 7, label: "Last 7 days" },
  { value: 28, label: "Last 28 days" },
  { value: 90, label: "Last 90 days" },
];

const DEFAULT_RANGE_PRESET: RangePreset = 28;

/** Daily-trend chart's and retention chart's fixed plot height — kept in sync between the two so the two sections read visually consistent even though they chart different units. */
const CHART_HEIGHT = 120;

function formatAvgViewDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  return formatDuration(seconds);
}

function hasAnyDailyActivity(daily: AnalyticsDailyPoint[]): boolean {
  return daily.some((point) => (point.views ?? 0) > 0 || (point.watch_time_s ?? 0) > 0);
}

/**
 * Daily views trend (`AnalyticsSummary.daily`) as a simple bar chart — no
 * charting library (see this chunk's report for why), just `View`s sized
 * against the range's own peak day so the shape of the trend is legible
 * without needing axis gridlines. Renders exactly the days the server
 * returned, in order; a sparse range (server only ever returns days that
 * exist) still lays out fine since bars are evenly spaced by index, not by
 * calendar date.
 */
function DailyTrendChart({ daily, theme }: { daily: AnalyticsDailyPoint[]; theme: NativeTheme }) {
  if (daily.length === 0 || !hasAnyDailyActivity(daily)) {
    return (
      <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
        No data for this range yet.
      </Text>
    );
  }

  const maxViews = Math.max(1, ...daily.map((point) => point.views ?? 0));
  const first = daily[0];
  const last = daily[daily.length - 1];

  return (
    <View>
      <View style={[styles.chartRow, { height: CHART_HEIGHT }]}>
        {daily.map((point, index) => {
          const height = Math.max(2, ((point.views ?? 0) / maxViews) * CHART_HEIGHT);
          return (
            <View
              key={point.date ?? index}
              style={{
                flex: 1,
                height,
                backgroundColor: theme.colors.accent,
                borderRadius: theme.radius.sm,
              }}
            />
          );
        })}
      </View>
      <View style={styles.chartAxisRow}>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>{first?.date ?? ""}</Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>{last?.date ?? ""}</Text>
      </View>
    </View>
  );
}

/**
 * Audience retention (`AnalyticsSummary.retention`) as a simple bar chart —
 * the mobile translation of the web's `retention-graph.ts` SVG polyline.
 * Same normalization: `viewer_count` is raw per-bucket counts, not a
 * percentage, so each bar is scaled against bucket 0's count (everyone who
 * started watching). Renders exactly the buckets the server returned, in
 * ascending `bucket_pct` order, rather than synthesizing a zero tail for
 * buckets the video never reached — a video whose retention stops at 60%
 * draws bars that stop short, which *is* the signal, not a bug.
 */
function RetentionChart({ retention, theme }: { retention: RetentionPoint[]; theme: NativeTheme }) {
  const points = [...retention].sort((a, b) => (a.bucket_pct ?? 0) - (b.bucket_pct ?? 0));

  if (points.length === 0) {
    return (
      <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
        No retention data yet for this range.
      </Text>
    );
  }

  const baseline = points[0]?.viewer_count ?? 0;
  const last = points[points.length - 1];

  return (
    <View>
      <View style={[styles.chartRow, { height: CHART_HEIGHT }]}>
        {points.map((point, index) => {
          const pct = baseline > 0 ? Math.max(0, Math.min(100, ((point.viewer_count ?? 0) / baseline) * 100)) : 0;
          return (
            <View
              key={`${point.bucket_pct}-${index}`}
              style={{
                flex: 1,
                height: Math.max(2, (pct / 100) * CHART_HEIGHT),
                backgroundColor: theme.colors.accent,
                borderRadius: theme.radius.sm,
              }}
            />
          );
        })}
      </View>
      <View style={styles.chartAxisRow}>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>{points[0]?.bucket_pct ?? 0}%</Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>
          drawn through {last?.bucket_pct ?? 0}% of the video
        </Text>
      </View>
    </View>
  );
}

/**
 * Creator Insights (PLAN.md §17.1's mobile row: "Per-video views, watch
 * time and retention, read-only" — M3 chunk 3, the last M3 chunk). Reached
 * from "Your videos" / the per-video edit screen (M2 chunk 3) via a route
 * param carrying the title/thumbnail already fetched there, so this screen
 * never re-fetches `getVideo` for display-only header text.
 *
 * Scope deliberately stops at per-video: `channel_id`/no-`video_id` (the
 * channel dashboard — traffic sources, subscriber growth, top-videos
 * ranking) is the web's `studio/analytics/analytics-page.ts`, not named in
 * §17.1's mobile row, so it's not built here (see this chunk's report for
 * the explicit top-videos call).
 */
export default function VideoInsightsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { id, title, thumbnail } = useLocalSearchParams<{ id: string; title?: string; thumbnail?: string }>();

  const [rangePreset, setRangePreset] = useState<RangePreset>(DEFAULT_RANGE_PRESET);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = dateRangeForPreset(rangePreset);
      const fetched = await getStudioAnalytics(client, { videoId: id, from, to });
      setSummary(fetched);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Failed to load analytics"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request, id, rangePreset]);

  useEffect(() => {
    void load();
  }, [load]);

  const thumbnailUrl = resolveMediaUrl(client.baseUrl, thumbnail);

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
          {thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              style={[styles.headerThumbnail, { borderRadius: theme.radius.sm, marginRight: theme.spacing[2] }]}
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700" }} numberOfLines={1}>
              Insights
            </Text>
            {title ? (
              <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: theme.spacing[4] }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
              {RANGE_PRESETS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  active={rangePreset === option.value}
                  onPress={() => setRangePreset(option.value)}
                  testID={`insights-range-${option.value}`}
                />
              ))}
            </View>

            {error ? (
              <View style={{ gap: theme.spacing[2] }}>
                <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.sm }} accessibilityRole="alert">
                  Could not load insights.
                </Text>
                <Pressable onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Retry">
                  <Text style={{ color: theme.colors.link, fontSize: theme.fontSize.sm, fontWeight: "600" }}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {loading && !summary ? (
              <LoadingState label="Loading insights…" />
            ) : summary ? (
              <>
                <View style={styles.cardsGrid}>
                  <SummaryCard theme={theme} label="Views" value={formatCompactNumber(summary.views ?? 0)} />
                  <SummaryCard theme={theme} label="Watch time" value={formatWatchTime(summary.watch_time_s ?? 0)} />
                  <SummaryCard
                    theme={theme}
                    label="Avg. view duration"
                    value={formatAvgViewDuration(summary.avg_view_duration_s)}
                  />
                  <SummaryCard theme={theme} label="Downloads" value={formatCompactNumber(summary.download_count ?? 0)} />
                </View>

                <View style={{ gap: theme.spacing[2] }}>
                  <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>
                    Daily views
                  </Text>
                  <DailyTrendChart daily={summary.daily ?? []} theme={theme} />
                </View>

                <View style={{ gap: theme.spacing[2] }}>
                  <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: "600" }}>
                    Audience retention
                  </Text>
                  <RetentionChart retention={summary.retention ?? []} theme={theme} />
                </View>
              </>
            ) : null}
          </View>
        </ScrollView>
      </Screen>
    </>
  );
}

function SummaryCard({ theme, label, value }: { theme: NativeTheme; label: string; value: string }) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md, padding: theme.spacing[3] },
      ]}
    >
      <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700", marginTop: theme.spacing[1] }}>
        {value}
      </Text>
    </View>
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
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  chartAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  headerThumbnail: {
    width: 56,
    aspectRatio: 16 / 9,
  },
});
