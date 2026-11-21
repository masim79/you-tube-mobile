import { Stack, useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { useApiClient } from "../api/useApiClient";
import { clearWatchHistory } from "../api/history";
import { qualityOptionsFromHeights, type QualityId } from "../player/qualityOptions";
import { Chip } from "../ui/Chip";
import { Screen } from "../ui/Screen";
import { useTheme } from "../theme/ThemeProvider";
import type { ThemeSetting } from "../theme";
import { useAuth } from "../store/AuthContext";
import { useSettings, type CaptionStyle } from "../store/SettingsContext";

const THEME_CHOICES: { id: ThemeSetting; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

// Same rendition set the quality/speed menus in `VideoPlayer.tsx` build
// from `Video.qualities` — fixed here since there's no specific video's
// renditions to read from on a settings screen.
const QUALITY_CHOICES = qualityOptionsFromHeights([1080, 720, 480, 360]);

const CAPTION_FONT_SIZE_CHOICES: { id: CaptionStyle["fontSize"]; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

/**
 * Settings (PLAN.md §17.1's You-tab row, M2 chunk 2). Every preference
 * here is backed by `SettingsContext` (client-local, `AsyncStorage` —
 * confirmed there is no server-side equivalent, see that file's header
 * comment) except theme, which flows through to `ThemeProvider` via
 * `SettingsContext`'s own hydration effect rather than being read/written
 * here directly.
 *
 * Caption style is collected here but not consumed anywhere yet — M3 is
 * the feature that will read it; said so plainly below rather than faking
 * a preview. Download quality and the Wi-Fi-only toggle *are* consumed now,
 * by M2 chunk 4's `src/downloads/DownloadButton.tsx`.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { isAuthenticated } = useAuth();
  const settings = useSettings();

  function confirmClearHistory() {
    Alert.alert("Clear watch history?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear history",
        style: "destructive",
        onPress: async () => {
          try {
            await clearWatchHistory(client);
            Alert.alert("Watch history cleared");
          } catch {
            Alert.alert("Couldn't clear history", "Please try again.");
          }
        },
      },
    ]);
  }

  function setCaptionFontSize(fontSize: CaptionStyle["fontSize"]) {
    settings.update("captionStyle", { ...settings.captionStyle, fontSize });
  }

  function toggleCaptionBackground() {
    settings.update("captionStyle", {
      ...settings.captionStyle,
      backgroundEnabled: !settings.captionStyle.backgroundEnabled,
    });
  }

  const switchTrackColor = { false: theme.colors.surfaceRaised, true: theme.colors.accent };

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
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700" }}>Settings</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing[6] }}>
        <SectionHeader label="Theme" />
        <ChipRow>
          {THEME_CHOICES.map((choice) => (
            <Chip
              key={choice.id}
              label={choice.label}
              active={settings.themeSetting === choice.id}
              onPress={() => settings.update("themeSetting", choice.id)}
              testID={`settings-theme-${choice.id}`}
            />
          ))}
        </ChipRow>

        <SectionHeader label="Default quality — Wi-Fi" />
        <QualityChipRow
          selected={settings.defaultQualityWifi}
          onSelect={(id) => settings.update("defaultQualityWifi", id)}
          testIDPrefix="settings-quality-wifi"
        />

        <SectionHeader label="Default quality — Cellular" />
        <QualityChipRow
          selected={settings.defaultQualityCellular}
          onSelect={(id) => settings.update("defaultQualityCellular", id)}
          testIDPrefix="settings-quality-cellular"
        />
        {settings.dataSaver ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
            Data Saver is on, so playback over cellular is capped to 360p regardless of this choice.
          </Text>
        ) : null}

        <SectionHeader label="Download quality" />
        <QualityChipRow
          selected={settings.downloadQuality}
          onSelect={(id) => settings.update("downloadQuality", id)}
          testIDPrefix="settings-quality-download"
        />
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
          The quality offered first when starting a new download from the Watch screen.
        </Text>

        <View style={[styles.row, { paddingVertical: theme.spacing[3] }]}>
          <View style={styles.rowLabel}>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>Download over Wi-Fi only</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
              Blocks starting a new download while on cellular.
            </Text>
          </View>
          <Switch
            testID="settings-download-wifi-only-switch"
            value={settings.downloadOverWifiOnly}
            onValueChange={(value) => settings.update("downloadOverWifiOnly", value)}
            trackColor={switchTrackColor}
            thumbColor={theme.colors.text}
          />
        </View>

        <View style={[styles.row, { paddingVertical: theme.spacing[3] }]}>
          <View style={styles.rowLabel}>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>Autoplay next video</Text>
          </View>
          <Switch
            testID="settings-autoplay-switch"
            value={settings.autoplayNext}
            onValueChange={(value) => settings.update("autoplayNext", value)}
            trackColor={switchTrackColor}
            thumbColor={theme.colors.text}
          />
        </View>

        <View style={[styles.row, { paddingVertical: theme.spacing[3] }]}>
          <View style={styles.rowLabel}>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>Data Saver</Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
              Caps cellular playback to 360p and pauses autoplay-next on cellular.
            </Text>
          </View>
          <Switch
            testID="settings-data-saver-switch"
            value={settings.dataSaver}
            onValueChange={(value) => settings.update("dataSaver", value)}
            trackColor={switchTrackColor}
            thumbColor={theme.colors.text}
          />
        </View>

        <SectionHeader label="Captions" />
        <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginBottom: theme.spacing[2] }}>
          Stored for when captions can be shown on mobile, coming in a later update — there's no caption renderer yet,
          so this has no visible effect today.
        </Text>
        <ChipRow>
          {CAPTION_FONT_SIZE_CHOICES.map((choice) => (
            <Chip
              key={choice.id}
              label={choice.label}
              active={settings.captionStyle.fontSize === choice.id}
              onPress={() => setCaptionFontSize(choice.id)}
              testID={`settings-caption-size-${choice.id}`}
            />
          ))}
        </ChipRow>
        <View style={[styles.row, { paddingVertical: theme.spacing[3] }]}>
          <View style={styles.rowLabel}>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>Caption background</Text>
          </View>
          <Switch
            testID="settings-caption-background-switch"
            value={settings.captionStyle.backgroundEnabled}
            onValueChange={toggleCaptionBackground}
            trackColor={switchTrackColor}
            thumbColor={theme.colors.text}
          />
        </View>

        {isAuthenticated ? (
          <>
            <SectionHeader label="History" />
            <Pressable
              onPress={confirmClearHistory}
              accessibilityRole="button"
              accessibilityLabel="Clear watch history"
              testID="settings-clear-history"
              style={{ paddingVertical: theme.spacing[3] }}
            >
              <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.md, fontWeight: "600" }}>
                Clear watch history
              </Text>
            </Pressable>
          </>
        ) : null}
        </ScrollView>
      </Screen>
    </>
  );
}

function SectionHeader({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.textSecondary,
        fontSize: theme.fontSize.xs,
        fontWeight: "600",
        marginTop: theme.spacing[4],
        marginBottom: theme.spacing[2],
      }}
    >
      {label.toUpperCase()}
    </Text>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

function QualityChipRow({
  selected,
  onSelect,
  testIDPrefix,
}: {
  selected: QualityId;
  onSelect: (id: QualityId) => void;
  testIDPrefix: string;
}) {
  return (
    <ChipRow>
      {QUALITY_CHOICES.map((option) => (
        <Chip
          key={String(option.id)}
          label={option.label}
          active={option.id === selected}
          onPress={() => onSelect(option.id)}
          testID={`${testIDPrefix}-${option.id}`}
        />
      ))}
    </ChipRow>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
});
