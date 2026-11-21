import { Share } from "react-native";

import type { ApiClient } from "../api/useApiClient";

/**
 * Builds a video's watch URL and opens the native share sheet — extracted
 * out of `ActionPills`' share button (M1 chunk 6) so the Shorts action rail
 * (M4 chunk 1) can reuse the exact same call rather than a second
 * `Share.share` site.
 */
export async function shareVideo(client: ApiClient, videoId: string | null | undefined): Promise<void> {
  const url = client.baseUrl && videoId ? `${client.baseUrl.replace(/\/+$/, "")}/watch/${videoId}` : null;
  if (!url) return;
  try {
    await Share.share({ message: url, url });
  } catch {
    // User-cancelled share sheets throw on some platforms — nothing to do.
  }
}
