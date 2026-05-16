import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft, Lock, MapPin, Star } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FeedPostCard from "../components/FeedPostCard";
import ProfileStat from "../components/ProfileStat";
import ProfileTabsBar, {
  type PostSubTabKey,
  type PublicProfileMainTabKey,
} from "../components/ProfileTabsBar";
import { SkeletonBox, SkeletonCard } from "../components/Skeleton";
import { API_BASE_URL } from "../constants/Api";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { StudySpot } from "../context/SpotsContext";
import { useSpots } from "../context/SpotsContext";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../types/navigation";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import {
  fetchFeedPostsByUser,
  fetchFeedLikedPostsByUser,
  type FeedPost,
} from "../utils/feedApi";
import { openSpotFromRootStack } from "../utils/openSpotFromAnyTab";
import {
  fetchReviewsByUserId,
  fetchSpotById,
  spotReviewPhotoUrls,
  spotReviewPrimaryId,
  type SpotReview,
} from "../utils/spotsApi";

type ProfileListRow = FeedPost | StudySpot | SpotReview;

type PublicRelationship =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "friends"
  | "self";

type PublicUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  bio?: string | null;
  profile_photo?: string | null;
  school?: string | null;
  field_of_study?: string | null;
  city?: string | null;
  country?: string | null;
  friends_count?: number | null;
  spots_created_count?: number | null;
  communities_joined_count?: number | null;
};

type PublicProfileResponse = {
  user?: PublicUser;
  profile?: PublicUser;
  relationship?: PublicRelationship;
  error?: string;
};

type Props = NativeStackScreenProps<RootStackParamList, "PublicProfile">;

function getDisplayName(user?: PublicUser | null) {
  const fullName = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || user?.username || "StudySpotr user";
}

function getResponseMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

function tabHintText(
  mainTab: PublicProfileMainTabKey,
  postSub: PostSubTabKey,
): string {
  if (mainTab === "posts") {
    return postSub === "published"
      ? "Posts they've shared."
      : "Posts they've liked.";
  }
  if (mainTab === "spots") return "Study spots they've added.";
  return "Reviews they've written.";
}

function tabEmptyLabel(
  mainTab: PublicProfileMainTabKey,
  postSub: PostSubTabKey,
): string {
  if (mainTab === "posts") {
    return postSub === "published" ? "No posts yet." : "No liked posts yet.";
  }
  if (mainTab === "spots") return "No spots listed yet.";
  return "No reviews yet.";
}

export default function PublicProfileScreen({ navigation, route }: Props) {
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { userId } = route.params;
  const { spots } = useSpots();

  const [user, setUser] = useState<PublicUser | null>(null);
  const [relationship, setRelationship] = useState<PublicRelationship>("none");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const [mainTab, setMainTab] = useState<PublicProfileMainTabKey>("posts");
  const [postSub, setPostSub] = useState<PostSubTabKey>("published");

  const [publishedPosts, setPublishedPosts] = useState<FeedPost[]>([]);
  const [publishedCursor, setPublishedCursor] = useState<string | null>(null);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [publishedError, setPublishedError] = useState<string | null>(null);

  const [likedPosts, setLikedPosts] = useState<FeedPost[]>([]);
  const [likedCursor, setLikedCursor] = useState<string | null>(null);
  const [likedLoading, setLikedLoading] = useState(false);
  const [likedError, setLikedError] = useState<string | null>(null);

  const [reviewsList, setReviewsList] = useState<SpotReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const [postsTailLoading, setPostsTailLoading] = useState(false);

  const loadingMoreRef = useRef(false);

  const unlocked = relationship === "friends" || relationship === "self";

  const avatarUri =
    typeof user?.profile_photo === "string" && user.profile_photo.trim()
      ? encodeURI(user.profile_photo.trim())
      : "";
  const displayName = getDisplayName(user);
  const avatarUser = useMemo(
    () => ({
      id: user?.id,
      first_name: user?.first_name ?? undefined,
      last_name: user?.last_name ?? undefined,
      username: user?.username ?? undefined,
      name: displayName,
    }),
    [displayName, user],
  );

  const stats = [
    { label: "Spots", value: String(user?.spots_created_count ?? 0) },
    { label: "Friends", value: String(user?.friends_count ?? 0) },
    {
      label: "Communities",
      value: String(user?.communities_joined_count ?? 0),
    },
  ];

  const enrichPost = useCallback(
    (post: FeedPost | null): FeedPost | null => {
      if (!post || !user?.id || post.author_id !== user.id || !user)
        return post;
      if (
        post.author?.first_name ||
        post.author?.profile_photo ||
        post.author?.username
      ) {
        return post;
      }
      return {
        ...post,
        author: {
          id: user.id,
          username: user.username ?? null,
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          profile_photo:
            typeof user.profile_photo === "string" ? user.profile_photo : null,
        },
      };
    },
    [user],
  );

  const userSpots = useMemo(() => {
    if (!user?.id) return [];
    return spots.filter((s) => {
      const cid = s.created_by_id;
      return typeof cid === "string" && cid === user.id;
    });
  }, [spots, user?.id]);

  async function fetchProfile(isRefresh = false) {
    if (!token) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/users/${userId}/public-profile`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const json = (await res
        .json()
        .catch(() => null)) as PublicProfileResponse | null;

      if (!res.ok) {
        throw new Error(getResponseMessage(json, `HTTP ${res.status}`));
      }

      const nextUser = json?.user ?? json?.profile ?? null;
      if (!nextUser) {
        throw new Error("Profile not found.");
      }

      setUser(nextUser);
      setRelationship(json?.relationship ?? "none");
      setAvatarLoadFailed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile.");
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    void fetchProfile();
  }, [token, userId]);

  async function sendProfileAction(nextRelationship: PublicRelationship) {
    if (!token) return;

    setActionLoading(true);
    const previousRelationship = relationship;
    setRelationship(nextRelationship);

    try {
      let res: Response;

      if (nextRelationship === "pending_sent") {
        res = await fetch(`${API_BASE_URL}/api/v1/users/send-friend-request`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ friend_id: userId }),
        });
      } else if (nextRelationship === "none") {
        res = await fetch(`${API_BASE_URL}/api/v1/users/friends/${userId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } else {
        res = await fetch(
          `${API_BASE_URL}/api/v1/users/friend-requests/respond`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ friend_id: userId, decision: "accept" }),
          },
        );
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getResponseMessage(json, "Could not update follow."));
      }

      void fetchProfile(true);
    } catch (err) {
      setRelationship(previousRelationship);
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not update follow.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  const loadMorePosts = useCallback(async () => {
    if (!unlocked || !token || loadingMoreRef.current) return;

    if (postSub === "published") {
      if (!publishedCursor) return;
      loadingMoreRef.current = true;
      setPostsTailLoading(true);
      try {
        const page = await fetchFeedPostsByUser(token, userId, {
          limit: 20,
          cursor: publishedCursor,
        });
        setPublishedPosts((prev) => [
          ...prev,
          ...page.posts.map((p) => enrichPost(p)!).filter(Boolean),
        ]);
        setPublishedCursor(page.next_cursor);
      } catch {
        //
      } finally {
        loadingMoreRef.current = false;
        setPostsTailLoading(false);
      }
    } else {
      if (!likedCursor) return;
      loadingMoreRef.current = true;
      setPostsTailLoading(true);
      try {
        const page = await fetchFeedLikedPostsByUser(token, userId, {
          limit: 20,
          cursor: likedCursor,
        });
        setLikedPosts((prev) => [
          ...prev,
          ...page.posts.map((p) => enrichPost(p)!).filter(Boolean),
        ]);
        setLikedCursor(page.next_cursor);
      } catch {
        //
      } finally {
        loadingMoreRef.current = false;
        setPostsTailLoading(false);
      }
    }
  }, [
    unlocked,
    token,
    userId,
    postSub,
    publishedCursor,
    likedCursor,
    enrichPost,
  ]);

  useEffect(() => {
    if (mainTab !== "posts" || !unlocked || !token || !user?.id || loading)
      return;

    const authToken = token;

    let cancelled = false;

    async function load() {
      setPublishedPosts([]);
      setPublishedCursor(null);
      setLikedPosts([]);
      setLikedCursor(null);

      if (postSub === "published") {
        setPublishedLoading(true);
        setPublishedError(null);
        try {
          const page = await fetchFeedPostsByUser(authToken, userId, {
            limit: 20,
          });
          if (cancelled) return;
          setPublishedPosts(
            page.posts.map((p) => enrichPost(p)!).filter(Boolean),
          );
          setPublishedCursor(page.next_cursor);
        } catch (e) {
          if (!cancelled)
            setPublishedError(
              e instanceof Error ? e.message : "Could not load posts.",
            );
        } finally {
          if (!cancelled) setPublishedLoading(false);
        }
      } else {
        setLikedLoading(true);
        setLikedError(null);
        try {
          const page = await fetchFeedLikedPostsByUser(authToken, userId, {
            limit: 20,
          });
          if (cancelled) return;
          setLikedPosts(page.posts.map((p) => enrichPost(p)!).filter(Boolean));
          setLikedCursor(page.next_cursor);
        } catch (e) {
          if (!cancelled)
            setLikedError(
              e instanceof Error ? e.message : "Could not load liked posts.",
            );
        } finally {
          if (!cancelled) setLikedLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    mainTab,
    postSub,
    unlocked,
    token,
    userId,
    user?.id,
    loading,
    enrichPost,
  ]);

  useEffect(() => {
    if (!unlocked || !userId || mainTab !== "reviews" || loading) return;
    let cancelled = false;
    void (async () => {
      setReviewsLoading(true);
      setReviewsError(null);
      try {
        const r = await fetchReviewsByUserId(userId, { token });
        if (!cancelled) setReviewsList(r);
      } catch (e) {
        if (!cancelled)
          setReviewsError(
            e instanceof Error ? e.message : "Could not load reviews.",
          );
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mainTab, userId, token, unlocked, loading]);

  const listData = useMemo(() => {
    if (!unlocked) return [];
    if (mainTab === "posts") {
      return postSub === "published" ? publishedPosts : likedPosts;
    }
    if (mainTab === "spots") return userSpots;
    if (mainTab === "reviews") return reviewsList;
    return [];
  }, [
    unlocked,
    mainTab,
    postSub,
    publishedPosts,
    likedPosts,
    userSpots,
    reviewsList,
  ]) as ProfileListRow[];

  const listLoading =
    mainTab === "posts"
      ? postSub === "published"
        ? publishedLoading
        : likedLoading
      : mainTab === "reviews"
        ? reviewsLoading
        : false;

  const listError =
    mainTab === "posts"
      ? postSub === "published"
        ? publishedError
        : likedError
      : mainTab === "reviews"
        ? reviewsError
        : null;

  const primaryAction =
    relationship === "friends"
      ? { label: "Unfollow", next: "none" as const, muted: true }
      : relationship === "pending_sent"
        ? { label: "Requested", next: "none" as const, muted: true }
        : relationship === "pending_received"
          ? { label: "Accept", next: "friends" as const, muted: false }
          : relationship === "self"
            ? null
            : {
                label: "Follow",
                next: "pending_sent" as PublicRelationship,
                muted: false,
              };

  async function reloadTabDataWhileRefreshingProfile() {
    if (!token || !userId || !unlocked) return;
    const authTok = token;

    try {
      if (mainTab === "posts") {
        if (postSub === "published") {
          setPublishedLoading(true);
          const page = await fetchFeedPostsByUser(authTok, userId, {
            limit: 20,
          });
          setPublishedPosts(
            page.posts.map((p) => enrichPost(p)!).filter(Boolean),
          );
          setPublishedCursor(page.next_cursor);
        } else {
          setLikedLoading(true);
          const page = await fetchFeedLikedPostsByUser(authTok, userId, {
            limit: 20,
          });
          setLikedPosts(page.posts.map((p) => enrichPost(p)!).filter(Boolean));
          setLikedCursor(page.next_cursor);
        }
      } else if (mainTab === "reviews") {
        setReviewsLoading(true);
        const r = await fetchReviewsByUserId(userId, { token });
        setReviewsList(r);
      }
    } catch {
      //
    } finally {
      setPublishedLoading(false);
      setLikedLoading(false);
      setReviewsLoading(false);
    }
  }

  function spotTitle(s: StudySpot): string {
    const title = typeof s.title === "string" ? s.title.trim() : "";
    const name = typeof s.name === "string" ? s.name.trim() : "";
    return title || name || "Untitled spot";
  }

  const openSpot = useCallback(
    (spot: StudySpot) => {
      openSpotFromRootStack(rootNavigation, spot);
    },
    [rootNavigation],
  );

  const openReviewSpot = useCallback(
    async (review: SpotReview) => {
      const sidRaw = review.spot_id;
      const sid =
        typeof sidRaw === "string"
          ? sidRaw.trim()
          : typeof sidRaw === "number"
            ? String(sidRaw).trim()
            : "";
      if (!sid) {
        Alert.alert("Unavailable", "This review is missing spot information.");
        return;
      }

      try {
        const fetched = await fetchSpotById(sid);
        if (fetched) openSpotFromRootStack(rootNavigation, fetched);
        else Alert.alert("Unavailable", "Could not load that spot.");
      } catch (e) {
        Alert.alert(
          "Error",
          e instanceof Error ? e.message : "Could not open spot.",
        );
      }
    },
    [rootNavigation],
  );

  const renderSpotRow = ({ item }: { item: StudySpot }) => (
    <TouchableOpacity
      style={styles.spotCard}
      activeOpacity={0.85}
      onPress={() => openSpot(item)}
    >
      {typeof item.image_url === "string" && item.image_url.trim() ? (
        <Image
          source={{ uri: encodeURI(item.image_url.trim()) }}
          style={styles.spotThumb}
        />
      ) : (
        <View style={[styles.spotThumb, styles.spotThumbPlaceholder]}>
          <MapPin size={22} color={Colors.primary} />
        </View>
      )}
      <View style={styles.spotBody}>
        <Text style={styles.spotTitle} numberOfLines={2}>
          {spotTitle(item)}
        </Text>
        {typeof item.address === "string" && !!item.address.trim() ? (
          <Text style={styles.spotSub} numberOfLines={2}>
            {item.address.trim()}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  const renderReviewRow = ({ item }: { item: SpotReview }) => {
    const rawTitle = (item as { spot_title?: unknown }).spot_title;
    const spotLabel =
      typeof rawTitle === "string" && rawTitle.trim()
        ? rawTitle.trim()
        : "Study spot";

    const photos = spotReviewPhotoUrls(item);
    const rating =
      typeof item.rating === "number"
        ? item.rating
        : typeof item.rating === "string"
          ? Number(item.rating)
          : NaN;
    const content =
      typeof item.content === "string" && item.content.trim()
        ? item.content.trim()
        : "";

    return (
      <TouchableOpacity
        style={styles.reviewCard}
        activeOpacity={0.85}
        onPress={() => void openReviewSpot(item)}
      >
        <View style={styles.reviewTop}>
          <Text style={styles.reviewSpotName} numberOfLines={2}>
            {spotLabel}
          </Text>
          {!Number.isNaN(rating) && rating >= 0 ? (
            <View style={styles.reviewStarsRow}>
              <Star size={16} color={Colors.accent} />
              <Text style={styles.reviewRating}>{rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
        {content ? (
          <Text style={styles.reviewExcerpt} numberOfLines={3}>
            {content}
          </Text>
        ) : null}
        {photos.length > 0 ? (
          <Image
            source={{ uri: photos[0] }}
            style={styles.reviewThumb}
            resizeMode="cover"
          />
        ) : null}
      </TouchableOpacity>
    );
  };

  function keyExtractor(item: ProfileListRow, index: number): string {
    if (mainTab === "posts") return (item as FeedPost).id;
    if (mainTab === "spots") return (item as StudySpot).id ?? `spot-${index}`;
    const r = item as SpotReview;
    const rid = spotReviewPrimaryId(r) ?? `rev-${index}`;
    return `${rid}_${index}`;
  }

  function renderItem({ item }: { item: FeedPost | StudySpot | SpotReview }) {
    if (!unlocked) return null;

    if (mainTab === "posts") {
      return (
        <FeedPostCard
          post={item as FeedPost}
          token={token}
          currentUserId={undefined}
        />
      );
    }
    if (mainTab === "spots") return renderSpotRow({ item: item as StudySpot });
    return renderReviewRow({ item: item as SpotReview });
  }

  const listHeaderEl =
    loading || !user ? null : (
      <>
        <View style={styles.heroCard}>
          {avatarUri && !avatarLoadFailed ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.avatarImage}
              resizeMode="cover"
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                { backgroundColor: getUserAvatarColor(avatarUser) },
              ]}
            >
              <Text style={styles.avatarInitials}>
                {getUserInitials(avatarUser)}
              </Text>
            </View>
          )}

          <Text style={styles.name}>{displayName}</Text>
          {!!user.username && (
            <Text style={styles.username}>@{user.username}</Text>
          )}

          {!!primaryAction && (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={actionLoading}
              onPress={() => void sendProfileAction(primaryAction.next)}
              style={[
                styles.followButton,
                primaryAction.muted && styles.followButtonMuted,
                actionLoading && styles.disabledButton,
              ]}
            >
              <Text
                style={[
                  styles.followButtonText,
                  primaryAction.muted && styles.followButtonMutedText,
                ]}
              >
                {primaryAction.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsContainer}>
          {stats.map((stat) => (
            <ProfileStat
              key={stat.label}
              label={stat.label}
              value={stat.value}
            />
          ))}
        </View>

        {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}

        <View style={styles.infoCard}>
          {!!user.school && (
            <Text style={styles.infoText}>School: {user.school}</Text>
          )}
          {!!user.field_of_study && (
            <Text style={styles.infoText}>Field: {user.field_of_study}</Text>
          )}
          {!!(user.city || user.country) && (
            <Text style={styles.infoText}>
              Location: {[user.city, user.country].filter(Boolean).join(", ")}
            </Text>
          )}
        </View>

        <ProfileTabsBar
          variant="public"
          mainTab={mainTab}
          onChangeMain={setMainTab}
          postSub={postSub}
          onChangePostSub={setPostSub}
        />
        <Text style={styles.tabHint}>{tabHintText(mainTab, postSub)}</Text>
        {!unlocked ? (
          <View style={styles.lockBanner}>
            <Lock size={20} color="#666" />
            <Text style={styles.lockText}>
              Send a follow request first to see posts, spots, and reviews once
              you’re friends.
            </Text>
          </View>
        ) : null}
      </>
    );

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.scroll}>
          <View style={styles.heroCard}>
            <SkeletonBox width={96} height={96} radius={48} />
            <SkeletonBox
              width={170}
              height={24}
              radius={12}
              style={{ marginTop: 16 }}
            />
            <SkeletonBox
              width={110}
              height={14}
              radius={7}
              style={{ marginTop: 8 }}
            />
            <SkeletonBox
              width={128}
              height={41}
              radius={14}
              style={{ marginTop: 18 }}
            />
          </View>
          <View style={styles.statsContainer}>
            {[0, 1, 2].map((item) => (
              <View key={item} style={styles.statSkeleton}>
                <SkeletonBox width={42} height={20} radius={10} />
                <SkeletonBox
                  width={70}
                  height={12}
                  radius={6}
                  style={{ marginTop: 8 }}
                />
              </View>
            ))}
          </View>
          <SkeletonBox
            width="88%"
            height={15}
            radius={8}
            style={{ alignSelf: "center", marginTop: 24 }}
          />
          <SkeletonCard style={styles.infoCard}>
            <SkeletonBox width="65%" height={14} radius={7} />
            <SkeletonBox width="56%" height={14} radius={7} />
            <SkeletonBox width="72%" height={14} radius={7} />
          </SkeletonCard>
          <SkeletonBox
            width="100%"
            height={44}
            radius={22}
            style={{ marginTop: 24 }}
          />
        </View>
      )}

      {!loading && !!error && (
        <View style={styles.stateCard}>
          <Text style={styles.emptyTitle}>Could not load profile</Text>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      )}

      {!loading && !error && user && (
        <FlatList<ProfileListRow>
          data={(unlocked ? listData : []) as ProfileListRow[]}
          keyExtractor={(item, index) => keyExtractor(item, index)}
          renderItem={(args) => renderItem(args as never)}
          ListHeaderComponent={
            <>
              <View style={styles.headerBottomPad}>{listHeaderEl}</View>
            </>
          }
          ListFooterComponent={
            unlocked && mainTab === "posts" && postsTailLoading ? (
              <ActivityIndicator style={styles.footerSpinner} />
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          onEndReachedThreshold={0.35}
          onEndReached={() => void loadMorePosts()}
          contentContainerStyle={styles.flatContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                await fetchProfile(true);
                await reloadTabDataWhileRefreshingProfile();
              }}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            !unlocked ? null : listLoading ? (
              <ActivityIndicator style={styles.emptySpinner} />
            ) : listError ? (
              <Text style={styles.inlineError}>{listError}</Text>
            ) : (
              <Text style={styles.listEmptyMuted}>
                {tabEmptyLabel(mainTab, postSub)}
              </Text>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    zIndex: 2,
    position: "relative",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  headerBottomPad: {
    paddingBottom: 12,
    paddingTop: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroCard: {
    alignItems: "center",
    paddingTop: 8,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 16,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarInitials: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 31,
  },
  name: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 25,
    textAlign: "center",
  },
  username: {
    color: Colors.primary,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    marginTop: 4,
  },
  followButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    marginTop: 18,
    minWidth: 128,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  followButtonMuted: {
    backgroundColor: "#fff",
  },
  disabledButton: {
    opacity: 0.6,
  },
  followButtonText: {
    color: "#fff",
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 15,
    textAlign: "center",
  },
  followButtonMutedText: {
    color: Colors.dark,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 24,
  },
  statSkeleton: {
    alignItems: "center",
  },
  bio: {
    color: "#555",
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 22,
    textAlign: "center",
  },
  tabHint: {
    marginTop: 6,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
  lockBanner: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eaeaea",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  lockText: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    gap: 8,
    marginTop: 22,
    padding: 18,
  },
  infoText: {
    color: "#555",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
  },
  stateCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 20,
  },
  emptyTitle: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    marginBottom: 6,
  },
  emptyText: {
    color: "#666",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  flatContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 44,
    gap: 10,
  },
  sep: { height: 4 },
  spotCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eaeaea",
    overflow: "hidden",
    gap: 12,
  },
  spotThumb: {
    width: 92,
    height: 92,
    backgroundColor: "#f5f5f5",
  },
  spotThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  spotBody: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 12,
    paddingRight: 12,
    gap: 4,
  },
  spotTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  spotSub: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  reviewCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eaeaea",
    padding: 14,
    gap: 8,
  },
  reviewTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  reviewSpotName: {
    flex: 1,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reviewRating: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  reviewExcerpt: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
  reviewThumb: {
    marginTop: 4,
    width: "100%",
    height: 140,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  listEmptyMuted: {
    textAlign: "center",
    marginTop: 16,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#888",
  },
  emptySpinner: {
    marginVertical: 24,
  },
  inlineError: {
    textAlign: "center",
    fontFamily: Fonts.instrument.medium,
    color: Colors.accent,
    marginVertical: 16,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  footerSpinner: {
    paddingVertical: 16,
  },
});
