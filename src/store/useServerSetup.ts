import { useRouter } from "expo-router";

import { getServerInfo } from "../api/server";
import { CLIENT_VERSION, isVersionBelow } from "../constants/client";
import { useServer } from "./ServerContext";

/** Adds `http://` when the user typed a bare host/IP, strips a trailing slash. */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/**
 * Shared by the manual-URL form (`setup/index.tsx`) and the QR scanner
 * (`setup/scan.tsx`): probe a candidate server, save it on success, and
 * route to the right next screen — the blocking update-required screen
 * when this build is older than `min_client_version_mobile` (§17.5),
 * otherwise the login screen.
 */
export function useServerSetup() {
  const router = useRouter();
  const { setServer } = useServer();

  async function checkAndSaveServer(
    candidateUrl: string,
    tailscaleName: string | null = null
  ): Promise<string | null> {
    const normalized = normalizeServerUrl(candidateUrl);
    if (!normalized) return "Enter a server address";

    let info;
    try {
      info = await getServerInfo(normalized);
    } catch (error) {
      return error instanceof Error ? error.message : "Could not reach server";
    }

    await setServer(normalized, tailscaleName);

    const minVersion = info.min_client_version_mobile ?? "0.0.0";
    if (isVersionBelow(CLIENT_VERSION, minVersion)) {
      router.replace({ pathname: "/setup/update-required", params: { minVersion } });
    } else {
      router.replace("/setup/login");
    }
    return null;
  }

  return { checkAndSaveServer };
}
