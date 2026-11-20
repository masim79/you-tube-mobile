#!/usr/bin/env node
// Generates `src/theme/tokens.generated.ts` from
// `vendor/you-tube/frontend/src/styles/themes/*.css` (the `you-tube` repo's
// PLAN.md §17.3, §10.2 — this repo pulls that repo in as a git submodule at
// `vendor/you-tube` specifically so this script and `gen:api` have a
// version-pinned path to the shared contract/tokens, since mobile
// development moved out of that monorepo into this standalone repo).
//
// This is the token bridge: the web and mobile clients must render the
// same palette from the one source of truth. Never hand-edit the
// generated file — re-run this script (`npm run gen:tokens`).
// CI fails if the generated file is stale relative to the CSS, so this
// script must be deterministic: same CSS in, byte-identical TS out.
//
// Parsing approach: the theme CSS files declare custom properties in a
// small number of flat (non-nested) rule blocks — `:root`,
// `[data-theme="light"]`, `[data-theme="dark"]` — so a regex-based
// top-level block scan is enough; we deliberately avoid pulling in a full
// CSS parser dependency for this.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const THEMES_DIR = join(REPO_ROOT, "vendor", "you-tube", "frontend", "src", "styles", "themes");
const OUT_FILE = join(REPO_ROOT, "src", "theme", "tokens.generated.ts");

/** Strips /* ... *\/ comments from a CSS source string. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Splits a CSS source into top-level { selector, body } rule blocks.
 * Assumes no nesting (true of these token files) — a selector followed by
 * a brace-delimited body, repeated.
 */
function extractRules(css) {
  const rules = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = ruleRe.exec(css)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

/** Parses `--name: value;` custom-property declarations out of a rule body. */
function parseDeclarations(body) {
  const vars = {};
  const declRe = /--([\w-]+)\s*:\s*([^;]+);?/g;
  let match;
  while ((match = declRe.exec(body)) !== null) {
    vars[match[1]] = match[2].trim();
  }
  return vars;
}

/** `color-accent` -> `colorAccent` */
function toCamelCase(kebab) {
  return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * Tokens that describe a *web* asset path (e.g. `--brand-logo: url(...)`)
 * rather than a color/font/size/radius/spacing value (§10.2's own
 * definition of what a design token is) — meaningless on mobile, where
 * brand imagery is a bundled asset, not a CSS url(). Excluded rather than
 * carried through as a dead string.
 */
function isWebOnlyToken(name) {
  return name.startsWith("brand-");
}

function buildThemes() {
  const files = readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith(".css"))
    .sort();

  if (files.length === 0) {
    throw new Error(
      `No *.css theme files found under ${THEMES_DIR} — is the vendor/you-tube submodule initialized? Run: git submodule update --init`
    );
  }

  // `base` holds anything declared under a selector that always applies
  // (`:root`); `light`/`dark` hold theme-specific overrides. Final palettes
  // are `{ ...base, ...overrides }`, mirroring the CSS cascade: a rule
  // combining `:root, [data-theme="light"]` lands in both `base` and
  // `light` with identical values, which is harmless.
  const base = {};
  const lightOverrides = {};
  const darkOverrides = {};

  for (const file of files) {
    const css = stripComments(readFileSync(join(THEMES_DIR, file), "utf8"));
    for (const { selector, body } of extractRules(css)) {
      const vars = parseDeclarations(body);
      const selectors = selector.split(",").map((s) => s.trim());
      const isRoot = selectors.some((s) => s === ":root");
      const isLight = selectors.some((s) => /\[data-theme=["']light["']\]/.test(s));
      const isDark = selectors.some((s) => /\[data-theme=["']dark["']\]/.test(s));

      if (isRoot) Object.assign(base, vars);
      if (isLight) Object.assign(lightOverrides, vars);
      if (isDark) Object.assign(darkOverrides, vars);
    }
  }

  const light = { ...base, ...lightOverrides };
  const dark = { ...base, ...darkOverrides };
  return { light, dark };
}

function toSortedEntries(vars) {
  return Object.keys(vars)
    .filter((name) => !isWebOnlyToken(name))
    .sort()
    .map((name) => [toCamelCase(name), vars[name]]);
}

function renderObjectLiteral(entries, indent = "  ") {
  return entries
    .map(([key, value]) => `${indent}${key}: ${JSON.stringify(value)},`)
    .join("\n");
}

function renderInterface(keys) {
  return keys.map((key) => `  ${key}: string;`).join("\n");
}

function generate() {
  const { light, dark } = buildThemes();
  const lightEntries = toSortedEntries(light);
  const darkEntries = toSortedEntries(dark);

  const allKeys = Array.from(
    new Set([...lightEntries.map(([k]) => k), ...darkEntries.map(([k]) => k)])
  ).sort();

  const output = `/**
 * AUTO-GENERATED by scripts/tokens-to-ts.mjs from
 * vendor/you-tube/frontend/src/styles/themes/*.css — DO NOT EDIT BY HAND.
 *
 * Re-run \`npm run gen:tokens\` to regenerate after the source CSS changes
 * (run \`git submodule update --remote vendor/you-tube\` first to pick up
 * the latest tokens from the you-tube repo). CI fails if this file is
 * stale.
 */

export interface ThemeTokens {
${renderInterface(allKeys)}
}

// Dark is the mobile default (you-tube repo's PLAN.md §17.4, §19.3) —
// unlike the web, where light loads first. Listed first for that reason.
export const dark: ThemeTokens = {
${renderObjectLiteral(darkEntries)}
};

export const light: ThemeTokens = {
${renderObjectLiteral(lightEntries)}
};

export const themes = { dark, light } as const;
export type ThemeName = keyof typeof themes;

export default dark;
`;

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, output, "utf8");
  console.log(`Wrote ${OUT_FILE}`);
}

generate();
