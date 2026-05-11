import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import {
  type SuggestedUser,
  useSuggestedUsers,
} from "../hooks/useSuggestedUsers";
import UserCard from "./UserCard";
import type { RootStackParamList } from "../types/navigation";
import { SkeletonBox, SkeletonCard } from "./Skeleton";

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
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
        data={
          initialLoaded
            ? users
            : Array.from(
                { length: 4 },
                (_, index) => ({ id: `skeleton-${index}` }) as SuggestedUser,
              )
        }
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyExtractor={(item) => item.id}
        renderItem={({ item: user }) => (
          <View style={styles.cardWrapper}>
            {!initialLoaded ? (
              <SkeletonCard style={styles.userSkeletonCard}>
                <SkeletonBox width={90} height={90} radius={45} />
                <SkeletonBox
                  width="76%"
                  height={15}
                  radius={8}
                  style={{ marginTop: 10 }}
                />
                <SkeletonBox
                  width="52%"
                  height={11}
                  radius={6}
                  style={{ marginTop: 6, marginBottom: 12 }}
                />
                <SkeletonBox width="100%" height={34} radius={12} />
              </SkeletonCard>
            ) : (
              <UserCard
                name={getDisplayName(user)}
                subtext={getSubtext(user)}
                avatarKey={user.id}
                avatar={getAvatar(user)}
                requested={Boolean(requestedIds[user.id])}
                loading={Boolean(requestingIds[user.id])}
                onFollow={() => void handleAddFriend(user.id)}
                onProfilePress={() =>
                  navigation.navigate("PublicProfile", { userId: user.id })
                }
              />
            )}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.cardWrapper}>
              <SkeletonCard style={styles.userSkeletonCard}>
                <SkeletonBox width={90} height={90} radius={45} />
                <SkeletonBox width="76%" height={15} radius={8} style={{ marginTop: 10 }} />
                <SkeletonBox width="52%" height={11} radius={6} style={{ marginTop: 6, marginBottom: 12 }} />
                <SkeletonBox width="100%" height={34} radius={12} />
              </SkeletonCard>
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
  userSkeletonCard: {
    alignItems: "center",
    borderRadius: 24,
    height: 210,
    justifyContent: "center",
    padding: 14,
    width: 160,
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
