import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Locally persisted recent-search terms for the Search screen (PLAN.md
 * §17.1's "recent searches" — there is no server-side endpoint for this
 * in `contracts/openapi.yaml`, confirmed before writing this, so it's
 * client-only). Non-sensitive, so plain `AsyncStorage` rather than the
 * keychain-backed `expo-secure-store` `secureStorage.ts` uses for the
 * refresh token (§20.2) — this app had no AsyncStorage dependency yet,
 * added with `npx expo install @react-native-async-storage/async-storage`.
 */
const STORAGE_KEY = "ht_recent_searches";
const MAX_ENTRIES = 10;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Moves `query` to the front, de-duplicated (case-insensitive), capped at `MAX_ENTRIES`. */
export async function addRecentSearch(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return getRecentSearches();
  const existing = await getRecentSearches();
  const deduped = existing.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...deduped].slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function removeRecentSearch(query: string): Promise<string[]> {
  const existing = await getRecentSearches();
  const next = existing.filter((item) => item !== query);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
