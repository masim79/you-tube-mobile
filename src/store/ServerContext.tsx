import React, { createContext, useContext, useMemo, useState } from "react";

import * as secureStorage from "./secureStorage";

interface ServerContextValue {
  /** `null` until a server has been chosen and saved (first run, or after a reset). */
  baseUrl: string | null;
  tailscaleName: string | null;
  /** Persists to the keychain and updates in-memory state together, so nothing can read one without the other. */
  setServer: (baseUrl: string, tailscaleName?: string | null) => Promise<void>;
  clearServer: () => Promise<void>;
  /** In-memory only, no keychain write — for the launch bootstrap loading an already-saved value back in. */
  hydrate: (baseUrl: string | null, tailscaleName: string | null) => void;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({
  children,
  initialBaseUrl = null,
  initialTailscaleName = null,
}: {
  children: React.ReactNode;
  initialBaseUrl?: string | null;
  initialTailscaleName?: string | null;
}) {
  const [baseUrl, setBaseUrl] = useState<string | null>(initialBaseUrl);
  const [tailscaleName, setTailscaleName] = useState<string | null>(initialTailscaleName);

  const value = useMemo<ServerContextValue>(
    () => ({
      baseUrl,
      tailscaleName,
      setServer: async (url, tsName = null) => {
        await secureStorage.setServerBaseUrl(url);
        await secureStorage.setServerTailscaleName(tsName);
        setBaseUrl(url);
        setTailscaleName(tsName);
      },
      clearServer: async () => {
        await secureStorage.clearServer();
        setBaseUrl(null);
        setTailscaleName(null);
      },
      hydrate: (url, tsName) => {
        setBaseUrl(url);
        setTailscaleName(tsName);
      },
    }),
    [baseUrl, tailscaleName]
  );

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error("useServer() must be called within a <ServerProvider>");
  return ctx;
}
