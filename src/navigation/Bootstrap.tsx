import { Stack, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";

import { getServerInfo } from "../api/server";
import { CLIENT_VERSION, isVersionBelow } from "../constants/client";
import { LoadingState } from "../ui/LoadingState";
import { useAuth } from "../store/AuthContext";
import * as secureStorage from "../store/secureStorage";
import { useServer } from "../store/ServerContext";

/**
 * Runs once on launch, inside the provider tree (needs `useServer`/
 * `useAuth`), and decides which screen the app opens on — this is what
 * Gate M-A's "survives an app restart still logged in" actually depends
 * on. Renders a loading spinner until that decision is made, then the
 * root `<Stack/>` (bare — auto-populated from `src/app/`'s file tree)
 * for whatever route it has navigated to.
 */
export function Bootstrap() {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const { hydrate } = useServer();
  const { silentRefresh } = useAuth();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    (async () => {
      const savedUrl = await secureStorage.getServerBaseUrl();
      const savedTailscaleName = await secureStorage.getServerTailscaleName();

      if (!savedUrl) {
        setReady(true);
        router.replace("/setup");
        return;
      }
      hydrate(savedUrl, savedTailscaleName);

      let minVersion: string | undefined;
      try {
        const info = await getServerInfo(savedUrl);
        minVersion = info.min_client_version_mobile;
      } catch {
        // Unreachable (server off, wrong network, address changed) — send
        // the user back through setup rather than straight to a login
        // screen for a server that can't be reached right now.
        setReady(true);
        router.replace("/setup");
        return;
      }

      if (minVersion && isVersionBelow(CLIENT_VERSION, minVersion)) {
        setReady(true);
        router.replace({ pathname: "/setup/update-required", params: { minVersion } });
        return;
      }

      const loggedIn = await silentRefresh();
      setReady(true);
      router.replace(loggedIn ? "/(tabs)/home" : "/setup/login");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return <LoadingState label="Starting HomeTube…" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
