import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../constants/Api";
import { postProfilePhotoMultipart } from "../utils/profilePhotoUpload";
import { disconnectChatSocket } from "../utils/chatSocket";

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
    /** After transition to main app, show animated welcome toast once. */
    showWelcomeToast?: boolean,
  ) => Promise<void>;
  /** Increments after successful login/register when `showWelcomeToast` is true — observed by LoginWelcomeToast. */
  welcomeToastNonce: number;
  /** Replay welcome toast animation (same as after login); use Profile → Settings “Preview…” in dev, or call from debugger. */
  replayWelcomeToast: () => void;
  updateProfile: (updates: Partial<UserProfileData>) => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  /** Multipart `image` upload to `/api/v1/auth/update-profile-photo`. */
  uploadProfilePhoto: (
    localUri: string,
    opts?: { contentType?: string; fileName?: string },
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEYS = {
  profile: "cached_profile",
  jwt: "jwt",
  refreshToken: "refresh_token",
} as const;

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [rememberSession, setRememberSession] = useState(false);
  const [welcomeToastNonce, setWelcomeToastNonce] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const isRefreshingRef = useRef(false);

  const clearStoredAuth = async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.profile),
      AsyncStorage.removeItem(STORAGE_KEYS.jwt),
      AsyncStorage.removeItem(STORAGE_KEYS.refreshToken),
    ]);
  };

  const refreshAccessToken = async (
    currentRefreshToken: string,
    shouldPersist: boolean,
  ) => {
    if (isRefreshingRef.current) {
      return null;
    }

    isRefreshingRef.current = true;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: currentRefreshToken }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.access_token) {
        return null;
      }

      const nextRefreshToken =
        typeof data.refresh_token === "string" && data.refresh_token.length > 0
          ? data.refresh_token
          : currentRefreshToken;

      setToken(data.access_token);
      setRefreshToken(nextRefreshToken);
      setRememberSession(shouldPersist);

      if (shouldPersist) {
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.jwt, data.access_token),
          AsyncStorage.setItem(STORAGE_KEYS.refreshToken, nextRefreshToken),
        ]);
      }

      return data.access_token as string;
    } catch {
      return null;
    } finally {
      isRefreshingRef.current = false;
    }
  };

  const logout = async () => {
    disconnectChatSocket();
    await clearStoredAuth();
    setProfile(null);
    setToken(null);
    setRefreshToken(null);
    setRememberSession(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const [storedProfile, storedToken, storedRefreshToken] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.profile),
            AsyncStorage.getItem(STORAGE_KEYS.jwt),
            AsyncStorage.getItem(STORAGE_KEYS.refreshToken),
          ]);

        const expiresAt = storedToken ? getTokenExpiryTime(storedToken) : null;
        const parsedProfile = storedProfile
          ? normalizeProfile(
              JSON.parse(storedProfile) as UserProfile | UserProfileData,
            )
          : null;

        if (
          parsedProfile &&
          storedToken &&
          storedRefreshToken &&
          (!expiresAt || expiresAt > Date.now())
        ) {
          setProfile(parsedProfile);
          setToken(storedToken);
          setRefreshToken(storedRefreshToken);
          setRememberSession(true);
        } else if (parsedProfile && storedRefreshToken) {
          const nextToken = await refreshAccessToken(storedRefreshToken, true);

          if (nextToken) {
            setProfile(parsedProfile);
          } else {
            await clearStoredAuth();
          }
        } else if (storedProfile || storedToken || storedRefreshToken) {
          await clearStoredAuth();
        }
      } catch {
        // storage read failed — treat as logged out
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!token || !refreshToken) {
      return;
    }

    const expiresAt = getTokenExpiryTime(token);
    if (!expiresAt) {
      return;
    }

    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry <= 0) {
      void logout();
      return;
    }

    const timeoutId = setTimeout(() => {
      void logout();
    }, msUntilExpiry);

    return () => clearTimeout(timeoutId);
  }, [refreshToken, token]);

  useEffect(() => {
    if (!token || !refreshToken) {
      return;
    }

    const intervalId = setInterval(
      () => {
        void (async () => {
          const nextToken = await refreshAccessToken(
            refreshToken,
            rememberSession,
          );

          if (!nextToken) {
            await logout();
          }
        })();
      },
      15 * 60 * 1000,
    );

    return () => clearInterval(intervalId);
  }, [logout, refreshToken, rememberSession, token]);

  const login = async (
    user: UserProfile | UserProfileData,
    accessToken: string,
    nextRefreshToken: string,
    rememberMe = true,
    showWelcomeToast?: boolean,
  ) => {
    const normalizedUser = normalizeProfile(user);

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
      await clearStoredAuth();
    }

    setProfile(normalizedUser);
    setToken(accessToken);
    setRefreshToken(nextRefreshToken);
    setRememberSession(rememberMe);
    if (showWelcomeToast) {
      setWelcomeToastNonce((n) => n + 1);
    }
  };

  function replayWelcomeToast() {
    setWelcomeToastNonce((n) => n + 1);
  }

  const persistProfile = async (nextProfile: UserProfile) => {
    if (rememberSession) {
      await AsyncStorage.setItem(
        STORAGE_KEYS.profile,
        JSON.stringify(nextProfile),
      );
    }
  };

  const updateProfile = async (updates: Partial<UserProfileData>) => {
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

      if (rememberSession) {
        void persistProfile(nextProfile);
      }
      return nextProfile;
    });
  };

  const refreshProfile = async () => {
    if (!token) {
      return null;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
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
  };

  const uploadProfilePhoto = async (
    localUri: string,
    opts?: { contentType?: string; fileName?: string },
  ) => {
    if (!token) {
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
      token,
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
  };

  return (
    <AuthContext.Provider
      value={{
        profile,
        token,
        isLoading,
        welcomeToastNonce,
        replayWelcomeToast,
        login,
        updateProfile,
        refreshProfile,
        uploadProfilePhoto,
        logout,
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
