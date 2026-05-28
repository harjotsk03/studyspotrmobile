import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Tracks whether the Feed screen is currently fetching data. Shared via
 * context so cross-tree consumers (most importantly the bottom tab bar's
 * Feed icon) can react without prop-drilling. Kept intentionally small —
 * one boolean — to avoid this becoming a god context.
 */
type FeedActivityContextValue = {
  /** True whenever the feed is doing an initial load OR a refresh. */
  feedLoading: boolean;
  setFeedLoading: (loading: boolean) => void;
};

const FeedActivityContext = createContext<FeedActivityContextValue | null>(
  null,
);

export function FeedActivityProvider({ children }: { children: ReactNode }) {
  const [feedLoading, setFeedLoadingState] = useState(false);

  const setFeedLoading = useCallback((loading: boolean) => {
    setFeedLoadingState(loading);
  }, []);

  const value = useMemo(
    () => ({ feedLoading, setFeedLoading }),
    [feedLoading, setFeedLoading],
  );

  return (
    <FeedActivityContext.Provider value={value}>
      {children}
    </FeedActivityContext.Provider>
  );
}

export function useFeedActivity() {
  const ctx = useContext(FeedActivityContext);
  if (!ctx) {
    throw new Error(
      "useFeedActivity must be used within a FeedActivityProvider",
    );
  }
  return ctx;
}
