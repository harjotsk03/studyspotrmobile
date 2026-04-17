import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SearchMode = "users" | "communities";

type SearchStateContextValue = {
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  toggleSearchMode: () => void;
};

const SearchStateContext = createContext<SearchStateContextValue | null>(null);

export function SearchStateProvider({ children }: { children: ReactNode }) {
  const [searchMode, setSearchMode] = useState<SearchMode>("users");

  const toggleSearchMode = useCallback(() => {
    setSearchMode((current) =>
      current === "users" ? "communities" : "users",
    );
  }, []);

  const value = useMemo(
    () => ({
      searchMode,
      setSearchMode,
      toggleSearchMode,
    }),
    [searchMode, toggleSearchMode],
  );

  return (
    <SearchStateContext.Provider value={value}>
      {children}
    </SearchStateContext.Provider>
  );
}

export function useSearchState() {
  const context = useContext(SearchStateContext);

  if (!context) {
    throw new Error("useSearchState must be used within SearchStateProvider");
  }

  return context;
}
