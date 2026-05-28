import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Lightweight cross-screen cache for community mutations the user makes
 * locally — currently just deletions. Any screen rendering a list of
 * communities (browse, profile sections, search results) can filter its
 * data through `removedCommunityIds` so a delete propagates instantly
 * without waiting on the next network round-trip.
 *
 * Intentionally narrow in scope: we only track the *delta* (which ids are
 * known-gone), not the full community list. List state still lives in each
 * screen so the existing fetch / refresh logic stays unchanged.
 */
type CommunityCacheContextValue = {
  /** IDs of communities the viewer has deleted this session. */
  removedCommunityIds: ReadonlySet<string>;
  /** Mark a community as locally deleted. List screens should filter their
   * data against `removedCommunityIds` to drop it from view immediately. */
  markCommunityRemoved: (id: string) => void;
  /** Drop an id back out of the "removed" set — useful if a fresh fetch
   * confirms the community is still around (rare; mostly here so callers
   * have a clean way to reset rather than re-using stale state). */
  clearCommunityRemoved: (id: string) => void;
};

const CommunityCacheContext = createContext<CommunityCacheContextValue | null>(
  null,
);

export function CommunityCacheProvider({ children }: { children: ReactNode }) {
  // Stored as an array in state so React picks up the change reliably; we
  // expose a `Set` to consumers because the hot path is membership checks
  // inside list-filter callbacks.
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const markCommunityRemoved = useCallback((id: string) => {
    if (!id) return;
    setRemovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const clearCommunityRemoved = useCallback((id: string) => {
    setRemovedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const removedSet = useMemo(() => new Set(removedIds), [removedIds]);

  const value = useMemo<CommunityCacheContextValue>(
    () => ({
      removedCommunityIds: removedSet,
      markCommunityRemoved,
      clearCommunityRemoved,
    }),
    [removedSet, markCommunityRemoved, clearCommunityRemoved],
  );

  return (
    <CommunityCacheContext.Provider value={value}>
      {children}
    </CommunityCacheContext.Provider>
  );
}

export function useCommunityCache() {
  const ctx = useContext(CommunityCacheContext);
  if (!ctx) {
    throw new Error(
      "useCommunityCache must be used within a CommunityCacheProvider",
    );
  }
  return ctx;
}
