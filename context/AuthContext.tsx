import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../constants/Api";
import { postProfilePhotoMultipart } from "../utils/profilePhotoUpload";
import { disconnectChatSocket } from "../utils/chatSocket";
import { profileNeedsOnboarding } from "../utils/profileCompleteness";
import { unregisterPushNotifications } from "../utils/pushNotifications";

export interface UserProfileData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar?: string;
  username?: string;
  points?: number;
  school?: string;
  field_of_study?: string;
  city?: string;
  country?: string;
  profile_photo?: string;
  onboarding_completed?: boolean;
  interests?: string[];
  academic_interests?: string[];
  friends_count?: number;
  spots_created_count?: number;
  communities_joined_count?: number;
  bio?: string;
  [key: string]: unknown;
}

export interface UserProfile {
  userProfile: UserProfileData;
}

interface AuthState {
  profile: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  login: (
    profile: UserProfile | UserProfileData,
    accessToken: string,
    refreshToken: string,
    rememberMe?: boolean,
  ) => Promise<void>;
  updateProfile: (updates: Partial<UserProfileData>) => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  /** Multipart `image` upload to `/api/v1/auth/update-profile-photo`. */
  uploadProfilePhoto: (
    localUri: string,
    opts?: { contentType?: string; fileName?: string },
  ) => Promise<void>;
  logout: () => Promise<void>;
  /** True when a session exists but onboarding is not finished. */
  needsOnboarding: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEYS = {
  profile: "cached_profile",
  jwt: "jwt",
  refreshToken: "refresh_token",
  rememberMe: "remember_me",
} as const;

export const REMEMBER_ME_STORAGE_KEY = STORAGE_KEYS.rememberMe;

/** Refresh a couple of minutes before the access token actually expires. */
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000;
const REFRESH_RETRY_MS = 30 * 1000;
const UNKNOWN_EXPIRY_REFRESH_MS = 15 * 60 * 1000;

type RefreshOutcome =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "invalid" | "network" };

export async function loadRememberMePreference(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.rememberMe);
    return value !== "0";
  } catch {
    return true;
  }
}

export async function persistRememberMePreference(rememberMe: boolean) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.rememberMe,
      rememberMe ? "1" : "0",
    );
  } catch {
    // Preference write failed — login still applies the in-memory choice.
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof globalThis.atob === "function") {
    return globalThis.atob(padded);
  }

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let buffer = 0;
  let bits = 0;

  for (const char of padded) {
    if (char === "=") {
      break;
    }

    const index = chars.indexOf(char);
    if (index < 0) {
      continue;
    }

    buffer = (buffer << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}

function getTokenExpiryTime(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

function tokenNeedsRefresh(token: string | null) {
  if (!token) {
    return true;
  }

  const expiresAt = getTokenExpiryTime(token);
  if (!expiresAt) {
    return false;
  }

  return expiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_MARGIN_MS;
}

function msUntilAccessTokenRefresh(token: string) {
  const expiresAt = getTokenExpiryTime(token);
  if (!expiresAt) {
    return UNKNOWN_EXPIRY_REFRESH_MS;
  }

  return Math.max(0, expiresAt - Date.now() - ACCESS_TOKEN_REFRESH_MARGIN_MS);
}

function isNestedUserProfile(
  profile: UserProfile | UserProfileData,
): profile is UserProfile {
  return (
    "userProfile" in profile &&
    typeof profile.userProfile === "object" &&
    profile.userProfile !== null
  );
}

function normalizeProfile(profile: UserProfile | UserProfileData): UserProfile {
  if (isNestedUserProfile(profile)) {
    return {
      userProfile: profile.userProfile,
    };
  }

  return {
    userProfile: profile,
  };
}

async function clearStoredSession() {
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEYS.profile),
    AsyncStorage.removeItem(STORAGE_KEYS.jwt),
    AsyncStorage.removeItem(STORAGE_KEYS.refreshToken),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const tokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  const rememberSessionRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<RefreshOutcome> | null>(null);

  const applySession = useCallback(
    (
      nextToken: string,
      nextRefreshToken: string,
      persist: boolean,
      nextProfile?: UserProfile | null,
    ) => {
      tokenRef.current = nextToken;
      refreshTokenRef.current = nextRefreshToken;
      rememberSessionRef.current = persist;
      setToken(nextToken);
      setRefreshToken(nextRefreshToken);
      if (nextProfile) {
        setProfile(nextProfile);
      }
    },
    [],
  );

  const refreshAccessToken = useCallback(async (): Promise<RefreshOutcome> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const currentRefreshToken = refreshTokenRef.current;
    if (!currentRefreshToken) {
      return { ok: false, reason: "invalid" };
    }

    const job = (async (): Promise<RefreshOutcome> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: currentRefreshToken }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.access_token) {
          if (res.status === 401 || res.status === 400) {
            return { ok: false, reason: "invalid" };
          }
          return { ok: false, reason: "network" };
        }

        const nextRefreshToken =
          typeof data.refresh_token === "string" && data.refresh_token.length > 0
            ? data.refresh_token
            : currentRefreshToken;

        applySession(
          data.access_token,
          nextRefreshToken,
          rememberSessionRef.current,
        );

        if (rememberSessionRef.current) {
          await Promise.all([
            AsyncStorage.setItem(STORAGE_KEYS.jwt, data.access_token),
            AsyncStorage.setItem(STORAGE_KEYS.refreshToken, nextRefreshToken),
          ]);
        }

        return { ok: true, accessToken: data.access_token as string };
      } catch {
        return { ok: false, reason: "network" };
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = job;
    return job;
  }, [applySession]);

  const logout = useCallback(async () => {
    const accessToken = tokenRef.current;
    disconnectChatSocket();
    if (accessToken) {
      void unregisterPushNotifications(accessToken);
    }
    await clearStoredSession();
    tokenRef.current = null;
    refreshTokenRef.current = null;
    rememberSessionRef.current = false;
    setProfile(null);
    setToken(null);
    setRefreshToken(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [storedProfile, storedToken, storedRefreshToken, storedRememberMe] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.profile),
            AsyncStorage.getItem(STORAGE_KEYS.jwt),
            AsyncStorage.getItem(STORAGE_KEYS.refreshToken),
            AsyncStorage.getItem(STORAGE_KEYS.rememberMe),
          ]);

        if (cancelled) {
          return;
        }

        const parsedProfile = storedProfile
          ? normalizeProfile(
              JSON.parse(storedProfile) as UserProfile | UserProfileData,
            )
          : null;

        const shouldRestore =
          storedRememberMe !== "0" &&
          Boolean(parsedProfile && storedRefreshToken);

        if (shouldRestore && parsedProfile && storedRefreshToken) {
          tokenRef.current = storedToken;
          refreshTokenRef.current = storedRefreshToken;
          rememberSessionRef.current = true;
          setRefreshToken(storedRefreshToken);

          if (storedToken && !tokenNeedsRefresh(storedToken)) {
            setProfile(parsedProfile);
            setToken(storedToken);
          } else {
            const outcome = await refreshAccessToken();
            if (cancelled) {
              return;
            }
            if (outcome.ok) {
              setProfile(parsedProfile);
            } else if (outcome.reason === "network" && storedToken) {
              // Offline / blip: keep the last session so Remember Me survives.
              setProfile(parsedProfile);
              setToken(storedToken);
            } else if (outcome.reason === "invalid") {
              await clearStoredSession();
              tokenRef.current = null;
              refreshTokenRef.current = null;
              rememberSessionRef.current = false;
              setRefreshToken(null);
            } else {
              await clearStoredSession();
            }
          }
        } else if (storedProfile || storedToken || storedRefreshToken) {
          await clearStoredSession();
        }
      } catch {
        // storage read failed — treat as logged out
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshAccessToken]);

  useEffect(() => {
    if (!token || !refreshToken) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const arm = (delay: number) => {
      timeoutId = setTimeout(() => {
        void (async () => {
          if (cancelled) {
            return;
          }

          const outcome = await refreshAccessToken();
          if (cancelled) {
            return;
          }

          if (outcome.ok) {
            return;
          }

          if (outcome.reason === "invalid") {
            await logout();
            return;
          }

          arm(REFRESH_RETRY_MS);
        })();
      }, delay);
    };

    arm(msUntilAccessTokenRefresh(token));

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [logout, refreshAccessToken, refreshToken, token]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }

      if (!tokenRef.current || !refreshTokenRef.current) {
        return;
      }

      if (!tokenNeedsRefresh(tokenRef.current)) {
        return;
      }

      void (async () => {
        const outcome = await refreshAccessToken();
        if (!outcome.ok && outcome.reason === "invalid") {
          await logout();
        }
      })();
    });

    return () => sub.remove();
  }, [logout, refreshAccessToken]);

  const login = useCallback(
    async (
      user: UserProfile | UserProfileData,
      accessToken: string,
      nextRefreshToken: string,
      rememberMe = true,
    ) => {
      const normalizedUser = normalizeProfile(user);

      await persistRememberMePreference(rememberMe);

      if (rememberMe) {
        await Promise.all([
          AsyncStorage.setItem(
            STORAGE_KEYS.profile,
            JSON.stringify(normalizedUser),
          ),
          AsyncStorage.setItem(STORAGE_KEYS.jwt, accessToken),
          AsyncStorage.setItem(STORAGE_KEYS.refreshToken, nextRefreshToken),
        ]);
      } else {
        await clearStoredSession();
      }

      applySession(accessToken, nextRefreshToken, rememberMe, normalizedUser);
    },
    [applySession],
  );

  const persistProfile = useCallback(async (nextProfile: UserProfile) => {
    if (!rememberSessionRef.current) {
      return;
    }

    await AsyncStorage.setItem(
      STORAGE_KEYS.profile,
      JSON.stringify(nextProfile),
    );
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfileData>) => {
      setProfile((current) => {
        if (!current) {
          return current;
        }

        const nextProfile: UserProfile = {
          ...current,
          userProfile: {
            ...current.userProfile,
            ...updates,
          },
        };

        void persistProfile(nextProfile);
        return nextProfile;
      });
    },
    [persistProfile],
  );

  const refreshProfile = useCallback(async () => {
    const accessToken = tokenRef.current;
    if (!accessToken) {
      return null;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/profile`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        return null;
      }

      const nextProfile = normalizeProfile(data.user ?? data.profile ?? data);
      setProfile(nextProfile);
      await persistProfile(nextProfile);
      return nextProfile;
    } catch {
      return null;
    }
  }, [persistProfile]);

  const uploadProfilePhoto = useCallback(
    async (
      localUri: string,
      opts?: { contentType?: string; fileName?: string },
    ) => {
      const accessToken = tokenRef.current;
      if (!accessToken) {
        throw new Error("You are not logged in.");
      }

      const rawName =
        opts?.fileName?.trim() ||
        localUri.split("/").pop()?.split("?")[0] ||
        "profile.jpg";
      const ext = rawName.includes(".")
        ? rawName.split(".").pop()?.toLowerCase()
        : "";
      const inferredMime =
        ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : ext === "heic" || ext === "heif"
              ? "image/heic"
              : "image/jpeg";
      const contentType = opts?.contentType?.trim() || inferredMime;
      const filename = rawName.includes(".") ? rawName : `${rawName}.jpg`;

      const responseJson = (await postProfilePhotoMultipart({
        token: accessToken,
        localUri,
        contentType,
        filename,
      })) as Record<string, unknown> | null;

      const data = responseJson;

      let nextPhoto: string | undefined;
      if (typeof data?.profile_photo === "string" && data.profile_photo.trim()) {
        nextPhoto = data.profile_photo.trim();
      }

      const userBlob = data?.user ?? data?.profile;
      if (
        !nextPhoto &&
        userBlob &&
        typeof userBlob === "object" &&
        userBlob !== null
      ) {
        const u = userBlob as Record<string, unknown>;
        const combined =
          (typeof u.profile_photo === "string" && u.profile_photo.trim()) ||
          (typeof u.photo_url === "string" && u.photo_url.trim()) ||
          (typeof u.avatar_url === "string" && u.avatar_url.trim()) ||
          "";
        nextPhoto = combined || undefined;
      }

      if (
        userBlob &&
        typeof userBlob === "object" &&
        userBlob !== null &&
        typeof (userBlob as Record<string, unknown>).id === "string"
      ) {
        await updateProfile({
          ...(userBlob as Partial<UserProfileData>),
          ...(nextPhoto ? { profile_photo: nextPhoto } : {}),
        });
        return;
      }

      if (nextPhoto) {
        await updateProfile({ profile_photo: nextPhoto });
        return;
      }

      await refreshProfile();
    },
    [refreshProfile, updateProfile],
  );

  return (
    <AuthContext.Provider
      value={{
        profile,
        token,
        isLoading,
        login,
        updateProfile,
        refreshProfile,
        uploadProfilePhoto,
        logout,
        needsOnboarding: profileNeedsOnboarding(profile?.userProfile),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
