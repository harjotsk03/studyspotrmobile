import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { fetchAllSpots } from "../utils/spotsApi";

export type SpotsViewMode = "map" | "list";

export type StudySpot = {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  noise_level?: string;
  noice_level?: string;
  lighting?: string;
  tables?: string;
  food_drink_allowed?: boolean;
  wifi_available?: boolean;
  outlets_available?: boolean;
  whiteboards_available?: boolean;
  group_work_friendly?: boolean;
  open_time?: string;
  close_time?: string;
  rating?: number | string;
  rating_count?: number | string;
  created_by_id?: string;
  created_by_name?: string;
  created_by_profile_photo?: string;
  image_url?: string;
  [key: string]: unknown;
};

type SpotsContextValue = {
  spots: StudySpot[];
  spotsLoading: boolean;
  spotsError: string | null;
  refetchSpots: () => Promise<void>;
  viewMode: SpotsViewMode;
  setViewMode: (mode: SpotsViewMode) => void;
  toggleViewMode: () => void;
};

const SpotsContext = createContext<SpotsContextValue | null>(null);

export function SpotsProvider({ children }: { children: ReactNode }) {
  const { isLoading: authLoading } = useAuth();
  const [viewMode, setViewMode] = useState<SpotsViewMode>("map");
  const [spots, setSpots] = useState<StudySpot[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [spotsError, setSpotsError] = useState<string | null>(null);

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === "map" ? "list" : "map"));
  }, []);

  const refetchSpots = useCallback(async () => {
    setSpotsLoading(true);
    setSpotsError(null);
    try {
      const list = await fetchAllSpots();
      setSpots(list);
    } catch (e) {
      setSpots([]);
      setSpotsError(e instanceof Error ? e.message : "Failed to load spots");
    } finally {
      setSpotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void refetchSpots();
  }, [authLoading, refetchSpots]);

  const value = useMemo(
    () => ({
      spots,
      spotsLoading,
      spotsError,
      refetchSpots,
      viewMode,
      setViewMode,
      toggleViewMode,
    }),
    [spots, spotsLoading, spotsError, refetchSpots, viewMode, toggleViewMode],
  );

  return (
    <SpotsContext.Provider value={value}>{children}</SpotsContext.Provider>
  );
}

export function useSpots() {
  const ctx = useContext(SpotsContext);
  if (!ctx) {
    throw new Error("useSpots must be used within SpotsProvider");
  }
  return ctx;
}
