import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Tracks whether a screen-filling overlay (currently: the full-screen reel
 * viewer) is open. Consumed by the bottom tab navigator so it can hide its
 * tab bar while the overlay is up — that way the overlay effectively covers
 * the whole screen even though it's rendered as an in-tree `View` (not a
 * native `Modal`) so that nested modals and stack navigation still work on
 * top of it.
 */
type FullScreenOverlayContextValue = {
  overlayCount: number;
  isOverlayOpen: boolean;
  pushOverlay: () => void;
  popOverlay: () => void;
};

const FullScreenOverlayContext =
  createContext<FullScreenOverlayContextValue | null>(null);

export function FullScreenOverlayProvider({ children }: { children: ReactNode }) {
  const [overlayCount, setOverlayCount] = useState(0);

  const pushOverlay = useCallback(() => {
    setOverlayCount((c) => c + 1);
  }, []);

  const popOverlay = useCallback(() => {
    setOverlayCount((c) => Math.max(0, c - 1));
  }, []);

  const value = useMemo(
    () => ({
      overlayCount,
      isOverlayOpen: overlayCount > 0,
      pushOverlay,
      popOverlay,
    }),
    [overlayCount, pushOverlay, popOverlay],
  );

  return (
    <FullScreenOverlayContext.Provider value={value}>
      {children}
    </FullScreenOverlayContext.Provider>
  );
}

export function useFullScreenOverlay() {
  const ctx = useContext(FullScreenOverlayContext);
  if (!ctx) {
    throw new Error(
      "useFullScreenOverlay must be used within a FullScreenOverlayProvider",
    );
  }
  return ctx;
}
