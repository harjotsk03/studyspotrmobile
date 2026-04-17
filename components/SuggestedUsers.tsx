import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import {
  type SuggestedUser,
  useSuggestedUsers,
} from "../hooks/useSuggestedUsers";
import UserCard from "./UserCard";

const PAGE_SIZE = 10;

function getDisplayName(user: SuggestedUser) {
  const fullName = [user.first_name, user.last_name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  return "Suggested User";
}

function getAvatar(user: SuggestedUser) {
  if (typeof user.profile_photo === "string" && user.profile_photo.trim().length > 0) {
    return user.profile_photo;
  }

  if (typeof user.avatar === "string" && user.avatar.trim().length > 0) {
    return user.avatar;
  }

  return undefined;
}

function getSubtext(user: SuggestedUser) {
  if (typeof user.username === "string" && user.username.trim().length > 0) {
    return `@${user.username}`;
  }

  return "You may know";
}

export default function SuggestedUsers() {
  const {
    fetchSuggestedUsers,
    sendFriendRequest,
    loadingSuggestedUsers,
    suggestedUsersError,
  } = useSuggestedUsers();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Record<string, boolean>>({});
  const [requestingIds, setRequestingIds] = useState<Record<string, boolean>>({});
  const inFlightOffset = useRef<number | null>(null);
  const usersCountRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  const loadUsers = useCallback(async (offset: number, replace = false) => {
    if (!replace) {
      if (
        !hasMoreRef.current ||
        loadingMoreRef.current ||
        inFlightOffset.current === offset
      ) {
        return;
      }
      inFlightOffset.current = offset;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }

    const nextUsers = await fetchSuggestedUsers({
      limit: PAGE_SIZE,
      offset,
    });

    setUsers((current) => {
      if (replace) {
        return nextUsers;
      }

      const existingIds = new Set(current.map((user) => user.id));
      const uniqueNext = nextUsers.filter((user) => !existingIds.has(user.id));
      const merged = [...current, ...uniqueNext];
      usersCountRef.current = merged.length;
      return merged;
    });
    if (replace) {
      usersCountRef.current = nextUsers.length;
    }

    const nextHasMore = nextUsers.length === PAGE_SIZE;
    hasMoreRef.current = nextHasMore;
    setHasMore(nextHasMore);
    setInitialLoaded(true);
    inFlightOffset.current = null;
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [fetchSuggestedUsers]);

  useEffect(() => {
    void loadUsers(0, true);
  }, [loadUsers]);

  const handleEndReached = useCallback(() => {
    if (!initialLoaded || usersCountRef.current < PAGE_SIZE) {
      return;
    }

    void loadUsers(usersCountRef.current);
  }, [initialLoaded, loadUsers]);

  const handleAddFriend = useCallback(
    async (userId: string) => {
      if (requestedIds[userId] || requestingIds[userId]) {
        return;
      }

      setRequestingIds((current) => ({ ...current, [userId]: true }));

      const success = await sendFriendRequest(userId);

      setRequestingIds((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });

      if (success) {
        setRequestedIds((current) => ({ ...current, [userId]: true }));
      }
    },
    [requestedIds, requestingIds, sendFriendRequest],
  );

  return (
    <View>
      <FlatList
        horizontal
        data={users}
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyExtractor={(item) => item.id}
        renderItem={({ item: user }) => (
          <View style={styles.cardWrapper}>
            <UserCard
              name={getDisplayName(user)}
              subtext={getSubtext(user)}
              avatar={getAvatar(user)}
              requested={Boolean(requestedIds[user.id])}
              loading={Boolean(requestingIds[user.id])}
              onFollow={() => void handleAddFriend(user.id)}
            />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={
          loadingMore ? (
            <View style={[styles.cardWrapper, styles.loadingCard]}>
              <Text style={styles.loadingTitle}>Loading...</Text>
              <Text style={styles.loadingBody}>Finding more suggested users</Text>
            </View>
          ) : null
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.45}
      />

      {!loadingSuggestedUsers && initialLoaded && users.length === 0 ? (
        <Text style={styles.helperText}>No suggested users right now.</Text>
      ) : null}

      {suggestedUsersError ? (
        <Text style={styles.errorText}>{suggestedUsersError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  separator: {
    width: 6,
  },
  cardWrapper: {
    width: 168,
  },
  loadingCard: {
    height: 210,
    borderRadius: 24,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D5D5D5",
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  loadingBody: {
    marginTop: 8,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "#777",
  },
  helperText: {
    marginTop: 12,
    paddingHorizontal: 20,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
  },
  errorText: {
    marginTop: 12,
    paddingHorizontal: 20,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#D14343",
  },
});
