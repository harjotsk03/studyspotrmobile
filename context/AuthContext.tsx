import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/Api';
import { Alert } from 'react-native';

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
  login: (profile: UserProfile, accessToken: string, refreshToken: string) => Promise<void>;
  updateProfile: (updates: Partial<UserProfileData>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEYS = {
  profile: 'cached_profile',
  jwt: 'jwt',
  refreshToken: 'refresh_token',
} as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedProfile, storedToken] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.profile),
          AsyncStorage.getItem(STORAGE_KEYS.jwt),
        ]);

        if (storedProfile && storedToken) {
          setProfile(JSON.parse(storedProfile));
          setToken(storedToken);
        }
      } catch {
        // storage read failed — treat as logged out
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (user: UserProfile, accessToken: string, refreshToken: string) => {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(user)),
      AsyncStorage.setItem(STORAGE_KEYS.jwt, accessToken),
      AsyncStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken),
    ]);
    setProfile(user);
    setToken(accessToken);
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

      void AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(nextProfile));
      return nextProfile;
    });
  };

  const logout = async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.profile),
      AsyncStorage.removeItem(STORAGE_KEYS.jwt),
      AsyncStorage.removeItem(STORAGE_KEYS.refreshToken),
    ]);
    setProfile(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ profile, token, isLoading, login, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
