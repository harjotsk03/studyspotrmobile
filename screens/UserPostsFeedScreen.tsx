import { Audio } from "expo-av";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";
import {
  useIsFocused,
  useNavigation,
  useRoute,
  type NavigationProp,
  type ParamListBase,
  type RouteProp,
} from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FeedCommentsModal from "../components/FeedCommentsModal";
import FeedInstaCard, { type MediaRect } from "../components/FeedInstaCard";
import FullScreenReelViewer from "../components/FullScreenReelViewer";
import SharePostToFriendsSheet from "../components/SharePostToFriendsSheet";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import {
  fetchFeedLikedPostsByUser,
  fetchFeedPostsByUser,
  type FeedPost,
} from "../utils/feedApi";

export type UserPostsFeedSource = "posts" | "liked";

/**
 * Route params for `UserPostsFeed`. Callers (Profile / PublicProfile) can preload
 * `initialPosts` + `initialCursor` so opening a grid tile feels instant and the
 * surrounding posts the user just saw remain in their scroll context.
 */
export type UserPostsFeedParams = {
  userId: string;
  source: UserPostsFeedSource;
  initialPostId?: string;
  /** Primary header (e.g. "@username" or display name). */
  title?: string;
  /** Secondary header label (defaults from `source`). */
  subtitle?: string;
  /** Pre-loaded page so we can scroll-to the tapped post without a refetch. */
  initialPosts?: FeedPost[];
  initialCursor?: string | null;
};

type UserPostsFeedRoute = RouteProp<
  { UserPostsFeed: UserPostsFeedParams },
  "UserPostsFeed"
>;

export default function UserPostsFeedScreen() {
  const route = useRoute<UserPostsFeedRoute>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { token, profile } = useAuth();
  const me = profile?.userProfile;

  const {
    userId,
    source,
    initialPostId,
    initialPosts,
    initialCursor,
    title,
    subtitle,
  } = route.params;

  const listRef = useRef<FlatList<FeedPost>>(null);
  const loadingMoreRef = useRef(false);
  const scrolledToInitialRef = useRef(false);

  const [posts, setPosts] = useState<FeedPost[]>(() => initialPosts ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialCursor ?? null,
  );
  const [loading, setLoading] = useState(!initialPosts?.length);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [activePostId, setActivePostId] = useState<string | null>(
    initialPostId ?? initialPosts?.[0]?.id ?? null,
  );
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [shareFriendsPost, setShareFriendsPost] = useState<FeedPost | null>(
    null,
  );
  const [globalMuted, setGlobalMuted] = useState(true);
  const [fullScreenPost, setFullScreenPost] = useState<FeedPost | null>(null);
  const [fullScreenRect, setFullScreenRect] = useState<MediaRect | null>(null);

  useEffect(() => {
    if (!token) return;
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
  }, [token]);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (!token) throw new Error("Sign in to view posts.");
      const opts = { limit: 20, cursor: cursor ?? undefined };
      return source === "liked"
        ? fetchFeedLikedPostsByUser(token, userId, opts)
        : fetchFeedPostsByUser(token, userId, opts);
    },
    [token, userId, source],
  );

  const loadInitial = useCallback(async () => {
    if (!token) {
      setPosts([]);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFeedError(null);
    try {
      const page = await fetchPage(null);
      setPosts(page.posts);
      setNextCursor(page.next_cursor);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : "Could not load posts.");
      setPosts([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [token, fetchPage]);

  /** Only fetch from scratch when the caller didn't hand us a pre-loaded page. */
  useEffect(() => {
    if (initialPosts && initialPosts.length > 0) return;
    void loadInitial();
  }, [loadInitial, initialPosts]);

  /**
   * Scroll to the tapped post once the list has data. FlatList items have
   * variable height (caption length), so we use scrollToIndex with an
   * onScrollToIndexFailed fallback that approximates by offset.
   */
  useEffect(() => {
    if (scrolledToInitialRef.current) return;
    if (!initialPostId || posts.length === 0) return;
    const idx = posts.findIndex((p) => p.id === initialPostId);
    if (idx <= 0) {
      scrolledToInitialRef.current = true;
      return;
    }
    scrolledToInitialRef.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: idx,
        animated: false,
      });
    });
  }, [initialPostId, posts]);

  const mergePost = useCallback((id: string, merge: Partial<FeedPost>) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...merge } : p)));
  }, []);

  const replacePost = useCallback((fresh: FeedPost) => {
    setPosts((prev) =>
      prev.map((p) => (p.id === fresh.id ? { ...p, ...fresh } : p)),
    );
    setFullScreenPost((curr) =>
      curr && curr.id === fresh.id ? { ...curr, ...fresh } : curr,
    );
  }, []);

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    setFeedError(null);
    try {
      const page = await fetchPage(null);
      setPosts(page.posts);
      setNextCursor(page.next_cursor);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : "Could not refresh.");
    } finally {
      setRefreshing(false);
    }
  }, [token, fetchPage]);

  const loadMore = useCallback(async () => {
    if (
      !token ||
      !nextCursor ||
      loadingMoreRef.current ||
      loading ||
      refreshing
    ) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextCursor);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of page.posts) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        }
        return merged;
      });
      setNextCursor(page.next_cursor);
    } catch {
      /* silent pagination failure — pull-to-refresh recovers */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [token, nextCursor, fetchPage, loading, refreshing]);

  const handleDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setCommentsPostId((open) => (open === postId ? null : open));
    setFullScreenPost((curr) => (curr && curr.id === postId ? null : curr));
  }, []);

  /** Topmost viewable post drives autoplay, matching FeedScreen behavior. */
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const v of viewableItems) {
        if (!v.isViewable) continue;
        const post = v.item as FeedPost | undefined;
        if (post?.id) {
          setActivePostId(post.id);
          return;
        }
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
    minimumViewTime: 80,
  }).current;

  const openFullScreen = useCallback((post: FeedPost, rect: MediaRect) => {
    setFullScreenRect(rect);
    setFullScreenPost(post);
  }, []);

  const closeFullScreen = useCallback(() => {
    setFullScreenPost(null);
  }, []);

  const handleFullScreenShareWithFriends = useCallback((post: FeedPost) => {
    setShareFriendsPost(post);
  }, []);

  const handleFullScreenOpenComments = useCallback((postId: string) => {
    setCommentsPostId(postId);
  }, []);

  // Pause feed video while the reel viewer is open.
  const effectiveActiveId = fullScreenPost ? null : activePostId;
  const commentsPost = commentsPostId
    ? posts.find((p) => p.id === commentsPostId)
    : undefined;

  const headerSubtitle =
    subtitle ?? (source === "liked" ? "Liked" : "Posts");

  const initialScrollIndex = useMemo(() => {
    if (!initialPostId || !initialPosts?.length) return undefined;
    const idx = initialPosts.findIndex((p) => p.id === initialPostId);
    return idx > 0 ? idx : undefined;
  }, [initialPostId, initialPosts]);

  const emptyCopy =
    source === "liked"
      ? "No liked posts to show."
      : "No posts to show yet.";

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topHeader,
          { paddingTop: insets.top + 8 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={styles.topIconBtn}
        >
          <ArrowLeft size={24} color={Colors.dark} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          {title ? (
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {headerSubtitle}
          </Text>
        </View>
        <View style={styles.topIconBtn} />
      </View>

      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        windowSize={7}
        maxToRenderPerBatch={4}
        initialNumToRender={Math.max(3, (initialScrollIndex ?? 0) + 1)}
        initialScrollIndex={initialScrollIndex}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        contentContainerStyle={
          posts.length === 0 ? styles.listEmptyContent : styles.listContent
        }
        ItemSeparatorComponent={() => <View style={styles.cardGap} />}
        onScrollToIndexFailed={(info) => {
          const wait = new Promise((r) => setTimeout(r, 60));
          void wait.then(() => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
          });
        }}
        renderItem={({ item: post }) => (
          <FeedInstaCard
            post={post}
            screenFocused={isFocused}
            isActive={post.id === effectiveActiveId}
            token={token}
            currentUserId={me?.id}
            globalMuted={globalMuted}
            onToggleMuted={() => setGlobalMuted((m) => !m)}
            onDeleted={handleDeleted}
            onMergePost={mergePost}
            onReplacePost={replacePost}
            onOpenComments={() => setCommentsPostId(post.id)}
            onShareWithFriends={() => setShareFriendsPost(post)}
            onOpenFullScreen={openFullScreen}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyLoadingWrap}>
              <ActivityIndicator color={Colors.dark} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{emptyCopy}</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={Colors.dark}
          />
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.listFooterLoading}>
              <ActivityIndicator color={Colors.dark} />
            </View>
          ) : (
            <View style={{ height: 24 }} />
          )
        }
      />

      {loading && posts.length === 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.dark} />
        </View>
      ) : null}

      {feedError ? (
        <View style={[styles.errorBanner, { bottom: 24 + insets.bottom }]}>
          <Text style={styles.errorText}>{feedError}</Text>
          <Pressable onPress={() => void loadInitial()}>
            <Text style={styles.errorRetry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <FeedCommentsModal
        visible={Boolean(commentsPostId)}
        postId={commentsPostId}
        token={token}
        currentUserId={me?.id}
        commentsCount={commentsPost?.comments_count ?? 0}
        onClose={() => setCommentsPostId(null)}
        onCommentsDelta={(delta) => {
          const pid = commentsPostId;
          if (!pid) return;
          setPosts((prev) =>
            prev.map((p) =>
              p.id === pid
                ? {
                    ...p,
                    comments_count: Math.max(0, p.comments_count + delta),
                  }
                : p,
            ),
          );
        }}
      />

      <FullScreenReelViewer
        visible={Boolean(fullScreenPost)}
        post={fullScreenPost}
        fromRect={fullScreenRect}
        token={token}
        currentUserId={me?.id}
        onClose={closeFullScreen}
        onMergePost={mergePost}
        onReplacePost={replacePost}
        onDeleted={handleDeleted}
        onOpenComments={handleFullScreenOpenComments}
        onShareWithFriends={handleFullScreenShareWithFriends}
      />

      <SharePostToFriendsSheet
        visible={Boolean(shareFriendsPost)}
        post={shareFriendsPost}
        token={token}
        navigation={navigation as NavigationProp<ParamListBase>}
        onClose={() => setShareFriendsPost(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE",
    zIndex: 10,
  },
  topIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  headerTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: "#666",
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    marginTop: 1,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 17,
    color: Colors.dark,
  },
  listContent: {
    paddingBottom: 40,
  },
  listEmptyContent: {
    flexGrow: 1,
  },
  cardGap: {
    height: 6,
    backgroundColor: "#FAFAFA",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
    zIndex: 15,
  },
  emptyLoadingWrap: {
    paddingTop: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 36,
    paddingTop: 80,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#777",
    textAlign: "center",
    lineHeight: 22,
  },
  errorBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    zIndex: 25,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#B91C1C",
  },
  errorRetry: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.primary,
  },
  listFooterLoading: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
