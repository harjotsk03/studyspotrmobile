import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "./AuthContext";

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
  created_by_name?: string;
  created_by_profile_photo?: string;
  image_url?: string;
  [key: string]: unknown;
};

async function fetchSpotsFromApi(accessToken: string): Promise<StudySpot[]> {
  const res = await fetch(`${API_BASE_URL}/api/v1/spots`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : "Failed to load spots";
    throw new Error(message);
  }

  if (Array.isArray(data)) {
    return data as StudySpot[];
  }

  if (Array.isArray(data?.spots)) {
    return data.spots as StudySpot[];
  }

  if (Array.isArray(data?.data)) {
    return data.data as StudySpot[];
  }

  return [];
}

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
  const { token: accessToken, isLoading: authLoading } = useAuth();
  const [viewMode, setViewMode] = useState<SpotsViewMode>("map");
  const [spots, setSpots] = useState<StudySpot[]>([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [spotsError, setSpotsError] = useState<string | null>(null);

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === "map" ? "list" : "map"));
  }, []);

  const refetchSpots = useCallback(async () => {
    if (!accessToken) {
      setSpots([]);
      setSpotsError(null);
      setSpotsLoading(false);
      return;
    }
    setSpotsLoading(true);
    setSpotsError(null);
    try {
      const list = await fetchSpotsFromApi(accessToken);
      setSpots(list);
    } catch (e) {
      setSpots([]);
      setSpotsError(e instanceof Error ? e.message : "Failed to load spots");
    } finally {
      setSpotsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (authLoading) return;
    void refetchSpots();
  }, [authLoading, accessToken, refetchSpots]);

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
