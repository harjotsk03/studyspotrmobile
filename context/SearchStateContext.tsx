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

  /** Text typed into the top-bar search field. */
  query: string;
  setQuery: (value: string) => void;
  /** True while the top-bar search field is expanded. */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** Bottom edge (px from screen top) of the top bar; the dropdown hangs from here. */
  dropdownTop: number;
  setDropdownTop: (value: number) => void;
  /** Bumped by the dropdown to ask the top bar to run its close animation. */
  closeSignal: number;
  requestCloseSearch: () => void;
};

const SearchStateContext = createContext<SearchStateContextValue | null>(null);

export function SearchStateProvider({ children }: { children: ReactNode }) {
  const [searchMode, setSearchMode] = useState<SearchMode>("users");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdownTop, setDropdownTop] = useState(0);
  const [closeSignal, setCloseSignal] = useState(0);

  const toggleSearchMode = useCallback(() => {
    setSearchMode((current) =>
      current === "users" ? "communities" : "users",
    );
  }, []);

  const requestCloseSearch = useCallback(() => {
    setCloseSignal((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      searchMode,
      setSearchMode,
      toggleSearchMode,
      query,
      setQuery,
      searchOpen,
      setSearchOpen,
      dropdownTop,
      setDropdownTop,
      closeSignal,
      requestCloseSearch,
    }),
    [
      searchMode,
      toggleSearchMode,
      query,
      searchOpen,
      dropdownTop,
      closeSignal,
      requestCloseSearch,
    ],
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
