import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../theme/ThemeProvider";

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  testID?: string;
}

/**
 * A minimal modal-sheet anchored to the bottom of the screen — the one
 * bottom-sheet primitive this chunk's comments list and bell-level picker
 * need (PLAN.md §17.1 "comments in a bottom sheet").
 *
 * Deliberately built on React Native's own `Modal` (`animationType="slide"`)
 * rather than a dedicated bottom-sheet package or a `react-native-reanimated`
 * drag gesture: `react-native-gesture-handler`/`reanimated` are already a
 * dependency (M1 chunk 4's player gestures), so a fully interactive
 * drag-to-dismiss sheet *could* be built without a new package, but doing
 * that properly (velocity-aware snap points, keyboard avoidance while a
 * comment composer is focused, etc.) would be a poor use of this chunk's
 * time next to the engagement features it's actually scoped to. `Modal`
 * gets the same "slides up over the content, tap the scrim or system back
 * to dismiss" interaction with far less code and no new dependency; a
 * proper draggable sheet is a reasonable follow-up, not a gap being hidden.
 */
export function BottomSheet({ visible, onClose, title, children, testID }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.fill}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          {/*
           * A scrim dims the content behind every sheet regardless of
           * theme (unlike component chrome, this isn't a semantic
           * surface/text/accent color from the palette — it's the same
           * kind of universal, non-tokenized effect as a drop shadow), so
           * a literal translucent black is used here rather than a theme
           * color at reduced opacity, which would render as a pale wash
           * in light theme instead of a dimming scrim.
           */}
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Pressable>

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radius.md,
              borderTopRightRadius: theme.radius.md,
              paddingBottom: Math.max(theme.spacing[4], insets.bottom),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
          {title ? (
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.md,
                fontWeight: "700",
                paddingHorizontal: theme.spacing[4],
                marginBottom: theme.spacing[2],
              }}
            >
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    maxHeight: "80%",
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
});
