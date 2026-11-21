import React from "react";
import { ScrollView, Text, View } from "react-native";

import type { Category } from "../api/discovery";
import { Chip } from "../ui/Chip";
import { TextField } from "../ui/TextField";
import { useTheme } from "../theme/ThemeProvider";

export interface UploadDetailsValue {
  title: string;
  description: string;
  /** Comma-separated free text, same shape the web's form collects then joins (§20.5). */
  tags: string;
  category: string | null;
  visibility: "public" | "unlisted" | "private";
  isShort: boolean;
}

export const INITIAL_DETAILS_VALUE: UploadDetailsValue = {
  title: "",
  description: "",
  tags: "",
  category: null,
  visibility: "public",
  isShort: false,
};

const VISIBILITY_OPTIONS: { value: UploadDetailsValue["visibility"]; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
];

/**
 * The title/description/tags/category/visibility/is_short form (PLAN.md
 * §17.1 "Create/Upload", M1 chunk 7) — mirrors the web's
 * `upload-details-form.ts` fields, sent as tus metadata (§20.5) by the
 * caller once the upload starts. Title is the only required field (the
 * Create screen's `canStartUpload` gate), matching the web.
 */
export function UploadDetailsForm({
  value,
  onChange,
  categories,
}: {
  value: UploadDetailsValue;
  onChange: (next: UploadDetailsValue) => void;
  categories: Category[];
}) {
  const theme = useTheme();

  function set<K extends keyof UploadDetailsValue>(key: K, next: UploadDetailsValue[K]): void {
    onChange({ ...value, [key]: next });
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ gap: theme.spacing[4] }}>
        <TextField
          label="Title"
          placeholder="Add a title that describes your video"
          value={value.title}
          onChangeText={(text) => set("title", text)}
          maxLength={100}
          testID="upload-title"
        />
        <TextField
          label="Description"
          placeholder="Tell viewers about your video"
          value={value.description}
          onChangeText={(text) => set("description", text)}
          multiline
          numberOfLines={4}
          testID="upload-description"
        />
        <TextField
          label="Tags (comma-separated)"
          placeholder="cooking, travel, tutorial"
          value={value.tags}
          onChangeText={(text) => set("tags", text)}
          autoCapitalize="none"
          testID="upload-tags"
        />

        {categories.length > 0 ? (
          <View>
            <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing[2] }}>
              Category
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
              {categories.map((category) => (
                <Chip
                  key={category.slug}
                  label={category.label}
                  active={value.category === category.slug}
                  onPress={() => set("category", value.category === category.slug ? null : category.slug)}
                  testID={`upload-category-${category.slug}`}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing[2] }}>
            Visibility
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] }}>
            {VISIBILITY_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                active={value.visibility === option.value}
                onPress={() => set("visibility", option.value)}
                testID={`upload-visibility-${option.value}`}
              />
            ))}
          </View>
        </View>

        <View>
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing[2] }}>
            Type
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
            <Chip label="Video" active={!value.isShort} onPress={() => set("isShort", false)} testID="upload-type-video" />
            <Chip label="Short" active={value.isShort} onPress={() => set("isShort", true)} testID="upload-type-short" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
