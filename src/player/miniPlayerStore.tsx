import React, { createContext, useContext, useMemo, useState } from "react";

/**
 * Mirrors the web's `MiniPlayerService` (`vendor/you-tube/frontend/src/app/shared/player/mini-player.service.ts`):
 * a single floating mini-player that survives in-app navigation. `WatchScreen`
 * calls `open()` when the viewer swipes the inline player down; `MiniPlayer`
 * (rendered once near the root, see `src/app/_layout.tsx`) renders whatever
 * is in `state`, and calls `close()` on swipe-to-dismiss.
 *
 * Unlike the Angular service, there's no imperative DOM-attach trick needed
 * here — `MiniPlayer` is just a normal component rendered as a sibling of
 * the router's `<Stack/>`, so plain React context is enough (same pattern as
 * `ServerContext`/`AuthContext`).
 */
export interface MiniPlayerState {
  readonly videoId: string;
  readonly title: string;
  readonly channelName: string | null;
  readonly channelAvatarUrl: string | null;
  /** Absolute, already `resolveMediaUrl`-resolved playback URL. */
  readonly src: string | null;
  /** Absolute, already-resolved poster/thumbnail URL. */
  readonly poster: string | null;
  readonly qualities: readonly number[];
  readonly startAtS: number;
  readonly autoplay: boolean;
}

interface MiniPlayerContextValue {
  state: MiniPlayerState | null;
  open: (next: MiniPlayerState) => void;
  /** Called by the widget as it plays, so the watch screen can resume at the right spot if this video is reopened. */
  updatePosition: (positionS: number) => void;
  close: () => void;
}

const MiniPlayerContext = createContext<MiniPlayerContextValue | null>(null);

export function MiniPlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MiniPlayerState | null>(null);

  const value = useMemo<MiniPlayerContextValue>(
    () => ({
      state,
      open: (next) => setState(next),
      updatePosition: (positionS) =>
        setState((current) => (current ? { ...current, startAtS: positionS } : current)),
      close: () => setState(null),
    }),
    [state]
  );

  return <MiniPlayerContext.Provider value={value}>{children}</MiniPlayerContext.Provider>;
}

export function useMiniPlayer(): MiniPlayerContextValue {
  const ctx = useContext(MiniPlayerContext);
  if (!ctx) throw new Error("useMiniPlayer() must be called within a <MiniPlayerProvider>");
  return ctx;
}
