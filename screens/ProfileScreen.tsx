import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ProfilePostGridTile from "../components/ProfilePostGridTile";
import ProfileStat from "../components/ProfileStat";
import ProfileTabsBar, {
  type OwnProfileMainTabKey,
} from "../components/ProfileTabsBar";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { StudySpot } from "../context/SpotsContext";
import { useSpots } from "../context/SpotsContext";
import { useAuth } from "../context/AuthContext";
import type { ProfileStackParamList } from "./ProfileSectionScreen";
import type { RootStackParamList } from "../types/navigation";
import { Camera, Heart, LayoutGrid, MapPin, Star } from "lucide-react-native";
import Button from "../components/Button";
import TopNav from "../components/TopNav";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import {
  fetchFeedLikedPostsByUser,
  fetchFeedPostsByUser,
  type FeedPost,
} from "../utils/feedApi";
import { getSpotTitle } from "../utils/getSpotTitle";
import { openSpotViewerFromProfileTab } from "../utils/openSpotFromAnyTab";
import {
  fetchReviewsByUserId,
  fetchSpotById,
  spotReviewPhotoUrls,
  spotReviewPrimaryId,
  spotReviewSpotLabel,
  type SpotReview,
} from "../utils/spotsApi";
type ProfileListRow = FeedPost | StudySpot | SpotReview;

type OwnListRow =
  | { kind: "grid"; id: string; posts: FeedPost[] }
  | { kind: "item"; id: string; item: ProfileListRow };
export default function ProfileScreen() {
  const {
    profile,
    token,
    refreshProfile,
    uploadProfilePhoto,
  } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { spots } = useSpots();

  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [mainTab, setMainTab] = useState<OwnProfileMainTabKey>("posts");

  const [publishedPosts, setPublishedPosts] = useState<FeedPost[]>([]);
  const [publishedCursor, setPublishedCursor] = useState<string | null>(null);
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [publishedError, setPublishedError] = useState<string | null>(null);
  const [publishedRefreshing, setPublishedRefreshing] = useState(false);

  const [likedPosts, setLikedPosts] = useState<FeedPost[]>([]);
  const [likedCursor, setLikedCursor] = useState<string | null>(null);
  const [likedLoading, setLikedLoading] = useState(false);
  const [likedError, setLikedError] = useState<string | null>(null);
  const [likedRefreshing, setLikedRefreshing] = useState(false);

  const [reviewsList, setReviewsList] = useState<SpotReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [postsTailLoading, setPostsTailLoading] = useState(false);

  const loadingMoreRef = useRef(false);

  const user = profile?.userProfile;
  const userId = user?.id ?? "";

  const profilePhotoUri =
    typeof user?.profile_photo === "string" && user.profile_photo.trim()
      ? encodeURI(user.profile_photo.trim())
      : "";

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profilePhotoUri]);

  const initials = useMemo(() => getUserInitials(user ?? {}), [user]);
  const avatarColor = useMemo(() => getUserAvatarColor(user ?? {}), [user]);

  const enrichPost = useCallback(
    (post: FeedPost | null): FeedPost | null => {
      if (!post || !user?.id || post.author_id !== user.id) return post;
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
          profile_photo: user.profile_photo ?? user.avatar ?? null,
        },
      };
    },
    [user],
  );

  const stats = [
    { label: "Spots", value: String(user?.spots_created_count ?? 0) },
    { label: "Friends", value: String(user?.friends_count ?? 0) },
    {
      label: "Communities",
      value: String(user?.communities_joined_count ?? 0),
    },
  ];

  const userSpots = useMemo(() => {
    return spots.filter((s) => {
      const cid = s.created_by_id;
      return typeof cid === "string" && cid === userId;
    });
  }, [spots, userId]);

  const refreshPublished = useCallback(async () => {
    if (!token || !userId) return;
    setPublishedRefreshing(true);
    setPublishedError(null);
    try {
      const page = await fetchFeedPostsByUser(token, userId, { limit: 20 });
      setPublishedPosts(page.posts.map((p) => enrichPost(p)!).filter(Boolean));
      setPublishedCursor(page.next_cursor);
    } catch (e) {
      setPublishedPosts([]);
      setPublishedCursor(null);
      setPublishedError(
        e instanceof Error ? e.message : "Could not load posts.",
      );
    } finally {
      setPublishedRefreshing(false);
    }
  }, [token, userId, enrichPost]);

  const refreshLiked = useCallback(async () => {
    if (!token || !userId) return;
    setLikedRefreshing(true);
    setLikedError(null);
    try {
      const page = await fetchFeedLikedPostsByUser(token, userId, {
        limit: 20,
      });
      setLikedPosts(page.posts.map((p) => enrichPost(p)!).filter(Boolean));
      setLikedCursor(page.next_cursor);
    } catch (e) {
      setLikedPosts([]);
      setLikedCursor(null);
      setLikedError(
        e instanceof Error ? e.message : "Could not load liked posts.",
      );
    } finally {
      setLikedRefreshing(false);
    }
  }, [token, userId, enrichPost]);

  const handleShareProfile = useCallback(async () => {
    const handle = user?.username?.trim()
      ? `@${user.username.trim()}`
      : [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
        "my profile";
    try {
      await Share.share({
        message: `Check out ${handle} on StudySpotr`,
      });
    } catch {
      /* dismissed */
    }
  }, [user?.username, user?.first_name, user?.last_name]);

  const loadMorePosts = useCallback(async () => {
    if (
      (mainTab !== "posts" && mainTab !== "liked") ||
      !token ||
      !userId ||
      loadingMoreRef.current
    ) {
      return;
    }
    if (mainTab === "posts") {
      if (!publishedCursor || publishedRefreshing) return;
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
      if (!likedCursor || likedRefreshing) return;
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
    mainTab,
    token,
    userId,
    publishedCursor,
    likedCursor,
    publishedRefreshing,
    likedRefreshing,
    enrichPost,
  ]);

  useEffect(() => {
    if (!token || !userId || mainTab !== "posts") return;
    setPublishedPosts([]);
    setPublishedCursor(null);
    void (async () => {
      setPublishedLoading(true);
      setPublishedError(null);
      try {
        const page = await fetchFeedPostsByUser(token, userId, { limit: 20 });
        setPublishedPosts(
          page.posts.map((p) => enrichPost(p)!).filter(Boolean),
        );
        setPublishedCursor(page.next_cursor);
      } catch (e) {
        setPublishedError(
          e instanceof Error ? e.message : "Could not load posts.",
        );
      } finally {
        setPublishedLoading(false);
      }
    })();
  }, [mainTab, token, userId, enrichPost]);

  useEffect(() => {
    if (!token || !userId || mainTab !== "liked") return;
    setLikedPosts([]);
    setLikedCursor(null);
    void (async () => {
      setLikedLoading(true);
      setLikedError(null);
      try {
        const page = await fetchFeedLikedPostsByUser(token, userId, {
          limit: 20,
        });
        setLikedPosts(page.posts.map((p) => enrichPost(p)!).filter(Boolean));
        setLikedCursor(page.next_cursor);
      } catch (e) {
        setLikedError(
          e instanceof Error ? e.message : "Could not load liked posts.",
        );
      } finally {
        setLikedLoading(false);
      }
    })();
  }, [mainTab, token, userId, enrichPost]);

  useEffect(() => {
    if (!userId || mainTab !== "reviews") return;
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
  }, [mainTab, userId, token]);

  const listRows = useMemo((): OwnListRow[] => {
    if (mainTab === "posts" || mainTab === "liked") {
      const posts =
        mainTab === "posts" ? publishedPosts : likedPosts;
      const rows: OwnListRow[] = [];
      for (let i = 0; i < posts.length; i += 3) {
        rows.push({
          kind: "grid",
          id: `${mainTab}-${i}`,
          posts: posts.slice(i, i + 3),
        });
      }
      return rows;
    }
    if (mainTab === "spots") {
      return userSpots.map((item, index) => ({
        kind: "item" as const,
        id: item.id ?? `spot-${index}`,
        item,
      }));
    }
    return reviewsList.map((item, index) => ({
      kind: "item" as const,
      id: `${spotReviewPrimaryId(item) ?? "rev"}-${index}`,
      item,
    }));
  }, [mainTab, publishedPosts, likedPosts, userSpots, reviewsList]);

  const listLoading =
    mainTab === "posts"
      ? publishedLoading || publishedRefreshing
      : mainTab === "liked"
        ? likedLoading || likedRefreshing
        : mainTab === "reviews"
          ? reviewsLoading
          : false;

  const listError =
    mainTab === "posts"
      ? publishedError
      : mainTab === "liked"
        ? likedError
        : mainTab === "reviews"
          ? reviewsError
          : null;

  const captureImageUri = useCallback(
    async (
      source: "library" | "camera",
    ): Promise<ImagePicker.ImagePickerAsset | null> => {
      const options = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        quality: 0.85,
      };

      if (source === "library") {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Permission needed",
            "Allow photo library access so you can choose a profile picture.",
          );
          return null;
        }

        const result = await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled || !result.assets?.[0]) return null;
        return result.assets[0];
      }

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow camera access to take your profile photo.",
        );
        return null;
      }

      const result = await ImagePicker.launchCameraAsync(options);
      if (result.canceled || !result.assets?.[0]) return null;
      return result.assets[0];
    },
    [],
  );

  const handleChangePhoto = useCallback(() => {
    const confirmAndUpload = async (src: "library" | "camera") => {
      try {
        setPhotoBusy(true);
        const asset = await captureImageUri(src);
        if (!asset?.uri) return;
        await uploadProfilePhoto(asset.uri, {
          contentType: asset.mimeType ?? undefined,
          fileName: asset.fileName ?? undefined,
        });
        setAvatarLoadFailed(false);
        Alert.alert("Photo updated", "Your profile photo was saved.");
      } catch (err) {
        Alert.alert(
          "Error",
          err instanceof Error
            ? err.message
            : "Could not update your photo. Please try again.",
        );
      } finally {
        setPhotoBusy(false);
      }
    };

    Alert.alert("Profile photo", "How would you like to update your picture?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Choose from library",
        onPress: () => void confirmAndUpload("library"),
      },
      {
        text: "Take photo",
        onPress: () => void confirmAndUpload("camera"),
      },
    ]);
  }, [captureImageUri, uploadProfilePhoto]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    if (mainTab === "posts") {
      await refreshPublished();
    } else if (mainTab === "liked") {
      await refreshLiked();
    } else if (mainTab === "reviews" && userId) {
      try {
        setReviewsLoading(true);
        const r = await fetchReviewsByUserId(userId, { token });
        setReviewsList(r);
      } catch {
        //
      } finally {
        setReviewsLoading(false);
      }
    }
    setRefreshing(false);
  };

  const isGridTab = mainTab === "posts" || mainTab === "liked";

  const openPostDetail = useCallback(
    (post: FeedPost) => {
      if (!userId) return;
      const isLikedTab = mainTab === "liked";
      const headerTitle = user?.username?.trim()
        ? `@${user.username.trim()}`
        : [user?.first_name, user?.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() || "Posts";
      navigation.navigate("UserPostsFeed", {
        userId,
        source: isLikedTab ? "liked" : "posts",
        initialPostId: post.id,
        title: headerTitle,
        subtitle: isLikedTab ? "Liked" : "Posts",
        initialPosts: isLikedTab ? likedPosts : publishedPosts,
        initialCursor: isLikedTab ? likedCursor : publishedCursor,
      });
    },
    [
      navigation,
      userId,
      mainTab,
      user?.username,
      user?.first_name,
      user?.last_name,
      likedPosts,
      publishedPosts,
      likedCursor,
      publishedCursor,
    ],
  );

  const openSpot = useCallback(
    (spot: StudySpot) => {
      openSpotViewerFromProfileTab(navigation, spot);
    },
    [navigation],
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
        if (fetched) openSpotViewerFromProfileTab(navigation, fetched);
        else Alert.alert("Unavailable", "Could not load that spot.");
      } catch (e) {
        Alert.alert(
          "Error",
          e instanceof Error ? e.message : "Could not open spot.",
        );
      }
    },
    [navigation],
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
          {getSpotTitle(item)}
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
    console.log("renderReviewRow", item);
    const spotLabel = spotReviewSpotLabel(item);

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

  const listHeaderEl = (
    <>
      <View style={styles.heroRow}>
        <View style={styles.avatarBlock}>
          <Pressable
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
            disabled={photoBusy}
            onPress={handleChangePhoto}
            style={[styles.avatarPressable, photoBusy && styles.disabledTap]}
          >
            {photoBusy ? (
              <View style={[styles.avatarFallback, styles.avatarLoading]}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : profilePhotoUri && !avatarLoadFailed ? (
              <Image
                key={profilePhotoUri}
                source={{ uri: profilePhotoUri }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <View
                style={[
                  styles.avatarFallback,
                  { backgroundColor: avatarColor },
                ]}
              >
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
            importantForAccessibility="no"
            style={[
              styles.avatarEditButton,
              photoBusy && styles.avatarEditDisabled,
            ]}
            disabled={photoBusy}
            hitSlop={8}
            onPress={handleChangePhoto}
          >
            <Camera size={16} color="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.heroMain}>
          <Text style={styles.name} numberOfLines={2}>
            {user?.first_name || "First"} {user?.last_name || "Last"}
          </Text>
          <Text style={user?.username ? styles.username : styles.noUsername}>
            {user?.username ? `@${user.username}` : "No username set"}
          </Text>
          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statCell}>
                <ProfileStat label={stat.label} value={stat.value} />
              </View>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.bio}>{user?.bio || "No bio set"}</Text>

      <View style={styles.actionButtonsRow}>
        <View style={styles.actionBtnCell}>
          <Button
            fullWidth
            label="Share profile"
            variant="outline"
            onPress={() => void handleShareProfile()}
          />
        </View>
        <View style={styles.actionBtnCell}>
          <Button
            fullWidth
            label="Edit profile"
            variant="default"
            onPress={() =>
              navigation.navigate("ProfileSection", { section: "personal" })
            }
          />
        </View>
      </View>

      <ProfileTabsBar
        variant="own"
        mainTab={mainTab}
        onChangeMain={setMainTab}
      />
    </>
  );

  function renderItem({ item }: { item: OwnListRow }) {
    if (item.kind === "grid") {
      return (
        <View style={styles.gridRow}>
          {item.posts.map((post) => (
            <ProfilePostGridTile
              key={post.id}
              post={post}
              onPress={() => openPostDetail(post)}
            />
          ))}
          {item.posts.length < 3
            ? Array.from({ length: 3 - item.posts.length }, (_, i) => (
                <View key={`pad-${item.id}-${i}`} style={styles.gridPad} />
              ))
            : null}
        </View>
      );
    }
    if (mainTab === "spots")
      return renderSpotRow({ item: item.item as StudySpot });
    return renderReviewRow({ item: item.item as SpotReview });
  }

  return (
    <View style={styles.safeArea}>
      <TopNav onOpenSettings={() => navigation.navigate("Settings")} />
      <View style={styles.container}>
        <FlatList<OwnListRow>
          style={styles.profileList}
          data={listRows}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={listHeaderEl}
          stickyHeaderIndices={[]}
          renderItem={renderItem}
          ListFooterComponent={
            (mainTab === "posts" || mainTab === "liked") && postsTailLoading ? (
              <ActivityIndicator style={styles.listFooterSpinner} />
            ) : null
          }
          onEndReachedThreshold={0.35}
          onEndReached={() => void loadMorePosts()}
          contentContainerStyle={styles.flatScroll}
          ItemSeparatorComponent={
            isGridTab ? undefined : () => <View style={styles.sep} />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing || publishedRefreshing || likedRefreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            listLoading ? (
              <ActivityIndicator style={styles.emptySpinner} />
            ) : listError ? (
              <Text style={styles.inlineError}>{listError}</Text>
            ) : (
              <ProfileTabEmpty
                tab={mainTab}
                onAddSpot={() => rootNavigation.navigate("CreateSpot")}
              />
            )
          }
        />
      </View>
    </View>
  );
}

function ProfileTabEmpty({
  tab,
  onAddSpot,
}: {
  tab: OwnProfileMainTabKey;
  onAddSpot: () => void;
}) {
  const Icon =
    tab === "posts"
      ? LayoutGrid
      : tab === "liked"
        ? Heart
        : tab === "reviews"
          ? Star
          : MapPin;
  const title =
    tab === "posts"
      ? "No posts yet"
      : tab === "liked"
        ? "No liked posts yet"
        : tab === "reviews"
          ? "No reviews yet"
          : "No spots yet";
  const body =
    tab === "posts"
      ? "Share a photo or thought and it’ll show up here."
      : tab === "liked"
        ? "Posts you like will show up here."
        : tab === "reviews"
          ? "Reviews you write will show up here."
          : "Add a place you found so others can find it too.";

  return (
    <View style={styles.emptyCenter}>
      <Icon size={44} color="#C5C9CE" strokeWidth={1.6} />
      <Text style={styles.emptyCenterTitle}>{title}</Text>
      <Text style={styles.emptyCenterBody}>{body}</Text>
      {tab === "spots" ? (
        <View style={styles.emptyCta}>
          <Button label="Add a spot" onPress={onAddSpot} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  profileList: {
    flex: 1,
  },
  flatScroll: {
    paddingTop: 12,
    paddingBottom: 44,
    flexGrow: 1,
    gap: 12,
  },
  gridRow: {
    flexDirection: "row",
    gap: 1,
    marginBottom: 1,
  },
  gridPad: {
    flex: 1,
    maxWidth: "33.333%",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingHorizontal: 16,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  avatarBlock: {
    position: "relative",
    width: 92,
    height: 92,
  },
  avatarPressable: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: "hidden",
  },
  disabledTap: {
    opacity: 0.7,
  },
  avatarLoading: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditButton: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarEditDisabled: {
    opacity: 0.55,
  },
  avatarImage: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 30,
    color: "#fff",
  },
  name: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    textAlign: "left",
  },
  username: {
    marginTop: 4,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: Colors.primary,
    textAlign: "left",
  },
  noUsername: {
    marginTop: 4,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: Colors.accent,
    textAlign: "left",
  },
  statsRow: {
    flexDirection: "row",
    marginTop: 12,
    width: "100%",
    justifyContent: "space-between",
    gap: 6,
  },
  statCell: {
    flex: 1,
    minWidth: 0,
  },
  bio: {
    marginTop: 14,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
    textAlign: "left",
    paddingHorizontal: 16,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    marginBottom: 2,
    paddingHorizontal: 16,
  },
  actionBtnCell: {
    flex: 1,
  },
  sep: {
    height: 4,
  },
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
  inlineError: {
    textAlign: "center",
    fontFamily: Fonts.instrument.medium,
    color: Colors.accent,
    marginVertical: 20,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  emptyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingTop: 36,
    paddingBottom: 56,
    minHeight: 240,
  },
  emptyCenterTitle: {
    marginTop: 14,
    color: Colors.dark,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    textAlign: "center",
  },
  emptyCenterBody: {
    marginTop: 6,
    maxWidth: 220,
    color: "#8A8F96",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyCta: {
    marginTop: 18,
  },
  emptySpinner: {
    marginVertical: 32,
  },
  listFooterSpinner: {
    marginVertical: 16,
  },
});
