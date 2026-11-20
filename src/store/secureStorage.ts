import * as SecureStore from "expo-secure-store";

/**
 * Every key this app ever writes to the OS keychain, in one place, so
 * nothing collides and a full logout/reset has a single list to clear.
 * The refresh token is the one §20.2 cares about (native clients have no
 * cookie jar); the server URL and Tailscale name live here too since
 * they're small and this is already the one "survives an app restart"
 * store — no separate AsyncStorage dependency for them.
 */
const KEYS = {
  refreshToken: "ht_refresh_token",
  serverBaseUrl: "ht_server_base_url",
  serverTailscaleName: "ht_server_tailscale_name",
} as const;

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.refreshToken);
}

export async function setRefreshToken(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.refreshToken, value);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.refreshToken);
}

export async function getServerBaseUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.serverBaseUrl);
}

export async function setServerBaseUrl(value: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.serverBaseUrl, value);
}

export async function getServerTailscaleName(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.serverTailscaleName);
}

export async function setServerTailscaleName(value: string | null): Promise<void> {
  if (value) {
    await SecureStore.setItemAsync(KEYS.serverTailscaleName, value);
  } else {
    await SecureStore.deleteItemAsync(KEYS.serverTailscaleName);
  }
}

/** Forgets the server entirely — used when a saved URL turns out unreachable/incompatible. */
export async function clearServer(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.serverBaseUrl);
  await SecureStore.deleteItemAsync(KEYS.serverTailscaleName);
}
