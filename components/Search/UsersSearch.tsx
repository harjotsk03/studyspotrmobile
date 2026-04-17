import { Search } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Button from "../Button";
import Input from "../Input";
import { API_BASE_URL } from "../../constants/Api";
import { Colors } from "../../constants/Colors";
import { Fonts } from "../../constants/Fonts";
import { useAuth } from "../../context/AuthContext";
import { useSuggestedUsers, type SuggestedUser } from "../../hooks/useSuggestedUsers";

const SEARCH_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_CACHE = new Map<string, SuggestedUser[]>();

function getDisplayName(user: SuggestedUser) {
  const fullName = [user.first_name, user.last_name]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .join(" ")
    .trim();

  return fullName || user.username || "User";
}

function getSubtext(user: SuggestedUser) {
  if (typeof user.username === "string" && user.username.trim().length > 0) {
    return `@${user.username}`;
  }

  return "StudySpotr user";
}

function sortUsers(users: SuggestedUser[]) {
  const score = (status?: string) => {
    if (status === "Friends") return 2;
    if (status === "Pending") return 1;
    return 0;
  };

  return [...users].sort((a, b) => {
    const scoreDiff = score(b.friend_status) - score(a.friend_status);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return getDisplayName(a).localeCompare(getDisplayName(b));
  });
}

export default function UsersSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SuggestedUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Record<string, boolean>>({});
  const [requestingIds, setRequestingIds] = useState<Record<string, boolean>>({});
  const { token } = useAuth();
  const { sendFriendRequest } = useSuggestedUsers();
  const activeControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedQuery = searchQuery.trim();

  useEffect(() => {
    const query = trimmedQuery;
    const cacheKey = `${query}|${SEARCH_LIMIT}`;

    if (!query) {
      activeControllerRef.current?.abort();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached) {
      setResults(sortUsers(cached));
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      activeControllerRef.current?.abort();

      const controller = new AbortController();
      activeControllerRef.current = controller;
      setIsSearching(true);
      setSearchError(null);

      try {
        if (!token) {
          throw new Error("You must be logged in to search users.");
        }

        const params = new URLSearchParams({
          q: query,
          limit: String(SEARCH_LIMIT),
        });

        const res = await fetch(
          `${API_BASE_URL}/api/v1/search/search-users?${params.toString()}`,
          {
            method: "GET",
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const message =
            typeof data?.error === "string"
              ? data.error
              : typeof data?.message === "string"
                ? data.message
                : "Failed to search users.";
          throw new Error(message);
        }

        const nextResults = Array.isArray(data?.users)
          ? sortUsers(data.users as SuggestedUser[])
          : [];

        SEARCH_CACHE.set(cacheKey, nextResults);
        setResults(nextResults);
      } catch (error: any) {
        if (error?.name === "AbortError") {
          return;
        }

        setSearchError(error?.message ?? "Failed to search users.");
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [token, trimmedQuery]);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const displayResults = useMemo(
    () =>
      results.map((user) => {
        if (requestedIds[user.id] && user.friend_status !== "Friends") {
          return {
            ...user,
            friend_status: "Pending",
          };
        }

        return user;
      }),
    [requestedIds, results],
  );

  const handleAddFriend = async (userId: string) => {
    if (!userId || requestedIds[userId] || requestingIds[userId]) {
      return;
    }

    setRequestingIds((current) => ({ ...current, [userId]: true }));
    const success = await sendFriendRequest(userId);

    setRequestingIds((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });

    if (!success) {
      return;
    }

    setRequestedIds((current) => ({ ...current, [userId]: true }));
    setResults((current) =>
      sortUsers(
        current.map((user) =>
          user.id === userId ? { ...user, friend_status: "Pending" } : user,
        ),
      ),
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Input
          value={searchQuery}
          onChangeText={setSearchQuery}
          icon={<Search size={16} color={Colors.dark} />}
          iconPosition="left"
          placeholder="Search for users..."
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />

        {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
      </View>

      {isSearching ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.stateText}>Searching users...</Text>
        </View>
      ) : null}

      {!isSearching && trimmedQuery.length > 0 && displayResults.length === 0 && !searchError ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>No users found.</Text>
        </View>
      ) : null}

      <FlatList
        data={displayResults}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const displayName = getDisplayName(item);
          const subtext = getSubtext(item);
          const status = item.friend_status;
          const isPending = status === "Pending";
          const isFriends = status === "Friends";
          const isLoading = Boolean(requestingIds[item.id]);
          const avatarUri =
            typeof item.profile_photo === "string" && item.profile_photo.trim().length > 0
              ? item.profile_photo
              : typeof item.avatar === "string" && item.avatar.trim().length > 0
                ? item.avatar
                : undefined;

          return (
            <View style={styles.resultRow}>
              <View style={styles.resultLeft}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>
                      {displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={styles.resultCopy}>
                  <Text style={styles.name} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.subtext} numberOfLines={1}>
                    {subtext}
                  </Text>
                </View>
              </View>

              <Button
                label={isFriends ? "Friends" : isPending ? "Requested" : "Add Friend"}
                variant={isFriends || isPending ? "secondary" : "default"}
                size="sm"
                loading={isLoading}
                disabled={isFriends || isPending}
                style={styles.actionButton}
                onPress={() => void handleAddFriend(item.id)}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  content: {
    paddingHorizontal: 20,
    marginTop: 6,
  },
  helperText: {
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#7A7A7A",
  },
  errorText: {
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#D14343",
  },
  stateContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  stateText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 36,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
  },
  resultLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  avatarInitial: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
  },
  resultCopy: {
    flex: 1,
    justifyContent: "center",
  },
  name: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  subtext: {
    marginTop: 2,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#8D8D8D",
  },
  actionButton: {
    minWidth: 108,
  },
});
