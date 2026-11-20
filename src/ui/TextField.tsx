import React from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

export interface TextFieldProps extends Omit<TextInputProps, "style" | "placeholderTextColor"> {
  label: string;
  errorMessage?: string | null;
}

/** Labelled text input, token-styled (§10.2). The one input primitive M0's setup/login screens need. */
export function TextField({ label, errorMessage, ...inputProps }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text
        style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing[1] }}
      >
        {label}
      </Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderColor: errorMessage ? theme.colors.accent : theme.colors.border,
            borderRadius: theme.radius.md,
            color: theme.colors.text,
            fontFamily: theme.fontFamily,
            fontSize: theme.fontSize.md,
            paddingHorizontal: theme.spacing[4],
            // §17.1: 44pt minimum touch target.
            minHeight: 44,
          },
        ]}
      />
      {errorMessage ? (
        <Text style={{ color: theme.colors.accent, fontSize: theme.fontSize.xs, marginTop: theme.spacing[1] }}>
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  input: {
    borderWidth: 1,
  },
});
