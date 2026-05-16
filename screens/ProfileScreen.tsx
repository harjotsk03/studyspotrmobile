import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import FeedPostCard from "../components/FeedPostCard";
import ProfileSectionButton from "../components/ProfileSectionButton";
import ProfileStat from "../components/ProfileStat";
import ProfileTabsBar, {
  type OwnProfileMainTabKey,
  type PostSubTabKey,
} from "../components/ProfileTabsBar";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { StudySpot } from "../context/SpotsContext";
import { useSpots } from "../context/SpotsContext";
import { useAuth } from "../context/AuthContext";
import type {
  ProfileSectionKey,
  ProfileStackParamList,
} from "./ProfileSectionScreen";
import { Camera, MapPin, Share, Star, UserPlus } from "lucide-react-native";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import {
  fetchFeedLikedPostsByUser,
  fetchFeedPostsByUser,
  type FeedPost,
} from "../utils/feedApi";
import { openSpotFromNestedTabNavigator } from "../utils/openSpotFromAnyTab";
import {
  fetchReviewsByUserId,
  fetchSpotById,
  spotReviewPhotoUrls,
  spotReviewPrimaryId,
  type SpotReview,
} from "../utils/spotsApi";

type ProfileListRow = FeedPost | StudySpot | SpotReview;
export default function ProfileScreen() {
  const { profile, token, logout, refreshProfile, uploadProfilePhoto } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { spots } = useSpots();

  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [mainTab, setMainTab] = useState<OwnProfileMainTabKey>("posts");
  const [postSub, setPostSub] = useState<PostSubTabKey>("published");

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
    { label: "Spots Created", value: String(user?.spots_created_count ?? 0) },
    { label: "Friends", value: String(user?.friends_count ?? 0) },
    {
      label: "Communities",
      value: String(user?.communities_joined_count ?? 0),
    },
  ];

  const sectionButtons: Array<{
    key: ProfileSectionKey;
    title: string;
    subtitle: string;
  }> = [
    {
      key: "personal",
      title: "Personal Details",
      subtitle: "First name, last name, username, and bio",
    },
    {
      key: "school",
      title: "School",
      subtitle: "School and field of study",
    },
    {
      key: "location",
      title: "Location",
      subtitle: "City and country",
    },
    {
      key: "settings",
      title: "Delete account",
      subtitle: "Permanently remove your StudySpotr account",
    },
  ];

  const userSpots = useMemo(() => {
    return spots.filter((s) => {
      const cid = s.created_by_id;
      return typeof cid === "string" && cid === userId;
    });
  }, [spots, userId]);

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout },
    ]);
  };

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
      setPublishedError(e instanceof Error ? e.message : "Could not load posts.");
    } finally {
      setPublishedRefreshing(false);
    }
  }, [token, userId, enrichPost]);

  const refreshLiked = useCallback(async () => {
    if (!token || !userId) return;
    setLikedRefreshing(true);
    setLikedError(null);
    try {
      const page = await fetchFeedLikedPostsByUser(token, userId, { limit: 20 });
      setLikedPosts(page.posts.map((p) => enrichPost(p)!).filter(Boolean));
      setLikedCursor(page.next_cursor);
    } catch (e) {
      setLikedPosts([]);
      setLikedCursor(null);
      setLikedError(e instanceof Error ? e.message : "Could not load liked posts.");
    } finally {
      setLikedRefreshing(false);
    }
  }, [token, userId, enrichPost]);

  const loadMorePosts = useCallback(async () => {
    if (mainTab !== "posts" || !token || !userId || loadingMoreRef.current) {
      return;
    }
    if (postSub === "published") {
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
    postSub,
    publishedCursor,
    likedCursor,
    publishedRefreshing,
    likedRefreshing,
    enrichPost,
  ]);

  useEffect(() => {
    if (!token || !userId || mainTab !== "posts") return;
    if (postSub === "published") {
      setPublishedPosts([]);
      setPublishedCursor(null);
      void (async () => {
        setPublishedLoading(true);
        setPublishedError(null);
        try {
          const page = await fetchFeedPostsByUser(token, userId, { limit: 20 });
          setPublishedPosts(page.posts.map((p) => enrichPost(p)!).filter(Boolean));
          setPublishedCursor(page.next_cursor);
        } catch (e) {
          setPublishedError(
            e instanceof Error ? e.message : "Could not load posts.",
          );
        } finally {
          setPublishedLoading(false);
        }
      })();
    } else {
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
    }
  }, [mainTab, postSub, token, userId, enrichPost]);

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

  const listData = useMemo(() => {
    if (mainTab === "posts") {
      return postSub === "published" ? publishedPosts : likedPosts;
    }
    if (mainTab === "spots") return userSpots;
    if (mainTab === "reviews") return reviewsList;
    return [];
  }, [
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
        ? publishedLoading || publishedRefreshing
        : likedLoading || likedRefreshing
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
      if (postSub === "published") await refreshPublished();
      else await refreshLiked();
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

  function spotTitle(s: StudySpot): string {
    const title = typeof s.title === "string" ? s.title.trim() : "";
    const name = typeof s.name === "string" ? s.name.trim() : "";
    return title || name || "Untitled spot";
  }

  const openSpot = useCallback(
    (spot: StudySpot) => {
      openSpotFromNestedTabNavigator(navigation, spot);
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
        if (fetched) openSpotFromNestedTabNavigator(navigation, fetched);
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

  const listHeaderEl = (
    <>
      <View style={styles.header}>
        <Pressable style={styles.headerButton}>
          <UserPlus size={20} color={Colors.dark} />
        </Pressable>
        <Pressable style={styles.headerButton}>
          <Share size={20} color={Colors.dark} />
        </Pressable>
      </View>
      <View style={styles.heroCard}>
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

        <View style={styles.nameContainer}>
          <Text style={styles.name}>
            {user?.first_name || "First"} {user?.last_name || "Last"}
          </Text>
        </View>
        <Text style={user?.username ? styles.username : styles.noUsername}>
          {user?.username ? `@${user.username}` : "No username set"}
        </Text>
      </View>

      <View style={styles.bioContainer}>
        <View style={styles.statsContainer}>
          {stats.map((stat, index) => (
            <Fragment key={stat.label}>
              {index > 0 ? <View style={styles.statsDivider} /> : null}
              <ProfileStat label={stat.label} value={stat.value} />
            </Fragment>
          ))}
        </View>
        <Text style={styles.bio}>{user?.bio || "No bio set"}</Text>
      </View>

      <ProfileTabsBar
        variant="own"
        mainTab={mainTab}
        onChangeMain={setMainTab}
        postSub={postSub}
        onChangePostSub={setPostSub}
      />
      <Text style={styles.tabHint}>{tabHintText(mainTab, postSub)}</Text>
    </>
  );

  function renderItem({ item }: { item: ProfileListRow }) {
    if (mainTab === "posts") {
      return (
        <FeedPostCard
          post={item as FeedPost}
          token={token}
          currentUserId={userId || null}
          onDeleted={(pid) =>
            postSub === "published"
              ? setPublishedPosts((prev) => prev.filter((x) => x.id !== pid))
              : setLikedPosts((prev) => prev.filter((x) => x.id !== pid))
          }
        />
      );
    }
    if (mainTab === "spots") return renderSpotRow({ item: item as StudySpot });
    if (mainTab === "reviews") {
      const rv = item as SpotReview;
      return renderReviewRow({ item: rv });
    }
    return null;
  }

  function keyExtractor(
    item: ProfileListRow,
    index: number,
  ): string {
    if (mainTab === "posts") return (item as FeedPost).id;
    if (mainTab === "spots")
      return (item as StudySpot).id ?? `spot-${index}`;
    const r = item as SpotReview;
    const rid = spotReviewPrimaryId(r) ?? `rev-${index}`;
    return `${rid}_${index}`;
  }

  return (
    <View style={styles.container}>
      <FlatList<ProfileListRow>
        data={(mainTab === "settings" ? [] : listData) as ProfileListRow[]}
        keyExtractor={(item, index) => keyExtractor(item, index)}
        ListHeaderComponent={listHeaderEl}
        stickyHeaderIndices={[]}
        renderItem={(args) =>
          mainTab === "settings" ? null : renderItem(args as never)
        }
        ListFooterComponent={
          mainTab === "posts" && postsTailLoading ? (
            <ActivityIndicator style={styles.listFooterSpinner} />
          ) : null
        }
        onEndReachedThreshold={0.35}
        onEndReached={() => void loadMorePosts()}
        contentContainerStyle={
          mainTab === "settings"
            ? [styles.flatScroll, styles.settingsScroll]
            : styles.flatScroll
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing || publishedRefreshing || likedRefreshing
            }
            onRefresh={() => void handleRefresh()}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={
          mainTab === "settings" ? (
            <SettingsBody
              sectionButtons={sectionButtons}
              onNavigateSection={(section) =>
                navigation.navigate("ProfileSection", { section })
              }
              onLogout={handleLogout}
            />
          ) : (
            listLoading ? (
              <ActivityIndicator style={styles.emptySpinner} />
            ) : listError ? (
              <Text style={styles.inlineError}>{listError}</Text>
            ) : (
              <Text style={styles.emptyText}>{tabEmptyLabel(mainTab, postSub)}</Text>
            )
          )
        }
      />
    </View>
  );
}

function SettingsBody({
  sectionButtons,
  onNavigateSection,
  onLogout,
}: {
  sectionButtons: Array<{ key: ProfileSectionKey; title: string; subtitle: string }>;
  onNavigateSection: (section: ProfileSectionKey) => void;
  onLogout: () => void;
}) {
  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.settingsBody}
    >
      <Text style={styles.sectionCardTitle}>Account & profile</Text>
      <View style={styles.sectionList}>
        {sectionButtons.map((item) => (
          <ProfileSectionButton
            key={item.key}
            title={item.title}
            subtitle={item.subtitle}
            onPress={() => onNavigateSection(item.key)}
          />
        ))}
      </View>
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={onLogout}
        activeOpacity={0.8}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function tabHintText(mainTab: OwnProfileMainTabKey, postSub: PostSubTabKey) {
  if (mainTab === "posts") {
    return postSub === "published"
      ? "Posts you've shared with friends."
      : "Posts you've liked.";
  }
  if (mainTab === "spots") return "Study spots you've added.";
  if (mainTab === "reviews") return "Reviews you've written.";
  return "Manage profile details and your account.";
}

function tabEmptyLabel(
  mainTab: OwnProfileMainTabKey,
  postSub: PostSubTabKey,
): string {
  if (mainTab === "posts") {
    return postSub === "published"
      ? "No posts yet."
      : "No liked posts yet.";
  }
  if (mainTab === "spots") return "No spots listed yet.";
  if (mainTab === "reviews") return "No reviews yet.";
  return "";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  flatScroll: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 44,
    flexGrow: 1,
    gap: 12,
  },
  settingsScroll: {
    flexGrow: 1,
    paddingBottom: 60,
  },
  heroCard: {
    alignItems: "center",
  },
  avatarBlock: {
    position: "relative",
    width: 92,
    height: 92,
    marginBottom: 16,
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
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  name: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 24,
    color: Colors.dark,
    textAlign: "center",
  },
  username: {
    marginTop: 4,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: Colors.primary,
  },
  noUsername: {
    marginTop: 4,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: Colors.accent,
  },
  header: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerButton: {
    padding: 8,
  },
  bioContainer: {
    marginTop: 16,
    gap: 4,
    alignItems: "center",
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: "#e5e5e5",
  },
  bio: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
    marginTop: 8,
    textAlign: "center",
  },
  logoutButton: {
    marginTop: 18,
    backgroundColor: Colors.dark,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  logoutText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: Fonts.gabarito.medium,
  },
  sep: {
    height: 4,
  },
  tabHint: {
    marginTop: 6,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
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
  emptyText: {
    textAlign: "center",
    marginTop: 24,
    fontFamily: Fonts.instrument.regular,
    color: "#888",
    fontSize: 15,
  },
  emptySpinner: {
    marginVertical: 32,
  },
  listFooterSpinner: {
    marginVertical: 16,
  },
  sectionCardTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 18,
    color: Colors.dark,
    marginBottom: 14,
    marginTop: 6,
    textAlign: "left",
  },
  settingsBody: {
    paddingBottom: 24,
  },
  sectionList: {
    gap: 12,
  },
});
