import { Audio } from "expo-av";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import {
  useIsFocused,
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Heart, PlusSquare } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FeedCommentsModal from "../components/FeedCommentsModal";
import FeedComposerModal from "../components/FeedComposerModal";
import FeedEndOfFeedCreate from "../components/FeedEndOfFeedCreate";
import FeedInstaCard, { type MediaRect } from "../components/FeedInstaCard";
import FullScreenReelViewer from "../components/FullScreenReelViewer";
import ShareToFriendsSheet from "../components/ShareToFriendsSheet";
import SuggestedUsers from "../components/SuggestedUsers";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { UserProfileData } from "../context/AuthContext";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import type { MainTabsParamList } from "../types/navigation";
import { fetchFeedFriends, type FeedPost } from "../utils/feedApi";

type FeedTabNavigation = BottomTabNavigationProp<MainTabsParamList, "Feed">;

type FeedListItem =
  | { type: "post"; key: string; post: FeedPost }
  | { type: "suggestions"; key: string };

/** Insert a SuggestedUsers carousel after every N posts. */
const POSTS_PER_SUGGESTION_BLOCK = 4;
/** Per-block jitter (±) to make insertion feel less mechanical. */
const SUGGESTION_JITTER = 1;

/** Small string hash → deterministic 0..1 number; used to vary cadence by feed. */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function buildFeedListItems(posts: FeedPost[]): FeedListItem[] {
  if (posts.length === 0) return [];
  const items: FeedListItem[] = [];
  // Seed by the first post id so the cadence is stable per feed session but
  // varies between refreshes / users.
  const sessionSeed = posts[0]?.id ?? "";
  let suggestionIndex = 0;

  const nextCadence = () => {
    const r = hashSeed(`${sessionSeed}:${suggestionIndex}`);
    const offset = Math.floor(r * (SUGGESTION_JITTER * 2 + 1)) - SUGGESTION_JITTER;
    return Math.max(2, POSTS_PER_SUGGESTION_BLOCK + offset);
  };

  let untilNext = nextCadence();
  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    items.push({ type: "post", key: `post-${post.id}`, post });
    untilNext -= 1;
    const isLast = i === posts.length - 1;
    if (untilNext <= 0 && !isLast) {
      items.push({ type: "suggestions", key: `sug-${suggestionIndex}` });
      suggestionIndex += 1;
      untilNext = nextCadence();
    }
  }
  return items;
}

function enrichFeedPostAuthor(
  post: FeedPost | null,
  me: UserProfileData | null | undefined,
): FeedPost | null {
  if (!post || !me?.id || post.author_id !== me.id) return post;
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
      id: me.id,
      username: me.username ?? null,
      first_name: me.first_name ?? null,
      last_name: me.last_name ?? null,
      profile_photo: me.profile_photo ?? me.avatar ?? null,
    },
  };
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const navigation = useNavigation<FeedTabNavigation>();
  const { unreadCount } = useNotifications();
  const { token, profile } = useAuth();
  const user = profile?.userProfile;

  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [shareFriendsPost, setShareFriendsPost] = useState<FeedPost | null>(
    null,
  );
  const [globalMuted, setGlobalMuted] = useState(true);
  const [fullScreenPost, setFullScreenPost] = useState<FeedPost | null>(null);
  const [fullScreenRect, setFullScreenRect] = useState<MediaRect | null>(null);

  const loadingMoreRef = useRef(false);
  const listRef = useRef<FlatList<FeedListItem>>(null);

  /** Drag-to-create at end-of-feed:
   * - `dragProgress` is a 0..1 value driven from the JS thread by tracking
   *   how far the user has over-scrolled past the bottom (iOS bounce).
   * - When `dragProgress` exceeds 1, we mark the gesture as "ready" so the
   *   footer can swap its copy to "Release to create". On release of the
   *   drag, if still ready, we open the composer.
   * - `triggeredRef` guards against multiple opens within the same gesture
   *   and is reset on momentum-scroll-end. */
  const dragProgress = useRef(new Animated.Value(0)).current;
  const [readyToTrigger, setReadyToTrigger] = useState(false);
  const triggeredRef = useRef(false);
  /** Overscroll past contentSize.height − layoutHeight needed to fully arm
   * the trigger. ~110 px feels deliberate without being annoying. */
  const DRAG_TRIGGER_PX = 110;

  useEffect(() => {
    if (!token) return;
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });
  }, [token]);

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (!token) throw new Error("Sign in to view your feed.");
      return fetchFeedFriends(token, {
        limit: 20,
        cursor: cursor ?? undefined,
      });
    },
    [token],
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
      setFeedError(e instanceof Error ? e.message : "Could not load feed.");
      setPosts([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [token, fetchPage]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

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

  useEffect(() => {
    if (posts.length === 0) {
      setActivePostId(null);
      return;
    }
    setActivePostId((current) =>
      current && posts.some((p) => p.id === current) ? current : posts[0].id,
    );
  }, [posts]);

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

  /** Tap the Feed tab while it's already focused → smooth scroll to top and
   * kick off a refresh. Pattern matches Instagram/Twitter's top-of-feed jump. */
  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (!navigation.isFocused()) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      void onRefresh();
    });
    return unsubscribe;
  }, [navigation, onRefresh]);

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

  const handlePosted = useCallback(
    (post: FeedPost | null) => {
      const enriched = enrichFeedPostAuthor(post, user ?? null);
      if (!enriched) return;
      setPosts((prev) => {
        if (prev.some((p) => p.id === enriched.id)) return prev;
        return [enriched, ...prev];
      });
    },
    [user],
  );

  const handleDeleted = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setCommentsPostId((open) => (open === postId ? null : open));
    setFullScreenPost((curr) => (curr && curr.id === postId ? null : curr));
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      // Pick the topmost viewable POST item (skip suggestion rows so videos
      // keep auto-playing while users scroll past a carousel).
      for (const v of viewableItems) {
        if (!v.isViewable) continue;
        const item = v.item as FeedListItem | undefined;
        if (item?.type === "post") {
          setActivePostId(item.post.id);
          return;
        }
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
    minimumViewTime: 80,
  }).current;

  const commentsPost = commentsPostId
    ? posts.find((p) => p.id === commentsPostId)
    : undefined;

  const openFullScreen = useCallback(
    (post: FeedPost, rect: MediaRect) => {
      setFullScreenRect(rect);
      setFullScreenPost(post);
    },
    [],
  );

  const closeFullScreen = useCallback(() => {
    setFullScreenPost(null);
  }, []);

  const handleFullScreenShareWithFriends = useCallback((post: FeedPost) => {
    setShareFriendsPost(post);
  }, []);

  const handleFullScreenOpenComments = useCallback((postId: string) => {
    setCommentsPostId(postId);
  }, []);

  // When the full-screen viewer is open and the underlying card's video is
  // playing, we want to pause the in-feed video. We accomplish that by
  // marking the active id as null while the viewer is open.
  const effectiveActiveId = fullScreenPost ? null : activePostId;

  const emptyCopy =
    "When friends share posts, they’ll show up here. Share something to start the conversation.";

  const headerHeight = useMemo(() => insets.top + 52, [insets.top]);

  const listItems = useMemo<FeedListItem[]>(
    () => buildFeedListItems(posts),
    [posts],
  );

  /** True when we have posts AND the API has signalled "no more pages".
   * We hide the trigger UI while pagination is still in-flight so a fast
   * scroll past the spinner doesn't open the composer. */
  const atEndOfFeed =
    posts.length > 0 && !nextCursor && !loadingMore && !loading && !refreshing;
  const atEndOfFeedRef = useRef(atEndOfFeed);
  useEffect(() => {
    atEndOfFeedRef.current = atEndOfFeed;
    if (!atEndOfFeed) {
      // Reset visual state when the trigger becomes unavailable (e.g. after
      // a refresh introduces a new cursor).
      dragProgress.setValue(0);
      setReadyToTrigger(false);
      triggeredRef.current = false;
    }
  }, [atEndOfFeed, dragProgress]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!atEndOfFeedRef.current) return;
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const maxScroll = Math.max(
        0,
        contentSize.height - layoutMeasurement.height,
      );
      const overscroll = contentOffset.y - maxScroll;
      if (overscroll <= 0) {
        // Not over-scrolling — keep at zero so any pending state clears.
        dragProgress.setValue(0);
        if (readyToTrigger) setReadyToTrigger(false);
        return;
      }
      const ratio = Math.min(1.4, overscroll / DRAG_TRIGGER_PX);
      dragProgress.setValue(ratio);
      const nextReady = ratio >= 1;
      if (nextReady !== readyToTrigger) setReadyToTrigger(nextReady);
    },
    [dragProgress, readyToTrigger],
  );

  const handleScrollEndDrag = useCallback(() => {
    if (!atEndOfFeedRef.current) return;
    if (triggeredRef.current) return;
    if (!readyToTrigger) {
      // Animate back to zero quickly so the chevron snaps home.
      Animated.timing(dragProgress, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }).start();
      return;
    }
    triggeredRef.current = true;
    setReadyToTrigger(false);
    Animated.timing(dragProgress, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
    setComposerOpen(true);
  }, [dragProgress, readyToTrigger]);

  const handleMomentumScrollEnd = useCallback(() => {
    triggeredRef.current = false;
  }, []);

  return (
    <View style={styles.container}>
      {!token ? (
        <>
          <View style={[styles.topHeader, { paddingTop: insets.top + 8 }]}>
            <Text style={styles.brand}>Study Spotr</Text>
          </View>
          <View style={styles.centerMessage}>
            <Text style={styles.centerTitle}>Sign in for your feed</Text>
            <Text style={styles.centerSubtitle}>
              Sign in to see posts from your friends.
            </Text>
          </View>
        </>
      ) : (
        <>
          <View
            style={[
              styles.topHeader,
              { paddingTop: insets.top + 8, height: headerHeight },
            ]}
          >
            <Text style={styles.brand}>Study Spotr</Text>
            <View style={styles.topActions}>
              <Pressable
                onPress={() => setComposerOpen(true)}
                hitSlop={10}
                style={styles.topIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Create post"
              >
                <PlusSquare size={26} color={Colors.dark} strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() =>
                  navigation.navigate({
                    name: "Inbox",
                    params: { screen: "InboxHome" },
                  })
                }
                hitSlop={10}
                style={styles.topIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Activity and notifications"
              >
                <Heart size={26} color={Colors.dark} strokeWidth={2} />
                {unreadCount > 0 ? (
                  <View style={styles.activityBadge}>
                    <Text style={styles.activityBadgeText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          <FlatList
            ref={listRef}
            data={listItems}
            keyExtractor={(item) => item.key}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            windowSize={7}
            maxToRenderPerBatch={4}
            initialNumToRender={3}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            contentContainerStyle={
              listItems.length === 0
                ? styles.listEmptyContent
                : styles.listContent
            }
            ItemSeparatorComponent={() => <View style={styles.cardGap} />}
            renderItem={({ item }) => {
              if (item.type === "suggestions") {
                return (
                  <View style={styles.suggestionsBlock}>
                    <Text style={styles.suggestionsTitle}>
                      Suggested for you
                    </Text>
                    <SuggestedUsers />
                  </View>
                );
              }
              const post = item.post;
              return (
                <FeedInstaCard
                  post={post}
                  screenFocused={isFocused}
                  isActive={post.id === effectiveActiveId}
                  token={token}
                  currentUserId={user?.id}
                  globalMuted={globalMuted}
                  onToggleMuted={() => setGlobalMuted((m) => !m)}
                  onDeleted={handleDeleted}
                  onMergePost={mergePost}
                  onReplacePost={replacePost}
                  onOpenComments={() => setCommentsPostId(post.id)}
                  onShareWithFriends={() => setShareFriendsPost(post)}
                  onOpenFullScreen={openFullScreen}
                />
              );
            }}
            ListEmptyComponent={
              loading ? (
                <View style={styles.emptyLoadingWrap}>
                  <ActivityIndicator color={Colors.dark} />
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>{emptyCopy}</Text>
                  <Pressable
                    style={styles.emptyCta}
                    onPress={() => setComposerOpen(true)}
                  >
                    <Text style={styles.emptyCtaLabel}>Create a post</Text>
                  </Pressable>
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
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onScrollEndDrag={handleScrollEndDrag}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.listFooterLoading}>
                  <ActivityIndicator color={Colors.dark} />
                </View>
              ) : atEndOfFeed ? (
                <FeedEndOfFeedCreate
                  dragProgress={dragProgress}
                  readyToTrigger={readyToTrigger}
                />
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
            <View
              style={[styles.errorBanner, { bottom: 24 + insets.bottom }]}
            >
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
            currentUserId={user?.id}
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
            currentUserId={user?.id}
            onClose={closeFullScreen}
            onMergePost={mergePost}
            onReplacePost={replacePost}
            onDeleted={handleDeleted}
            onOpenComments={handleFullScreenOpenComments}
            onShareWithFriends={handleFullScreenShareWithFriends}
          />
        </>
      )}

      <ShareToFriendsSheet
        visible={Boolean(shareFriendsPost)}
        attachment={
          shareFriendsPost ? { kind: "post", post: shareFriendsPost } : null
        }
        token={token}
        navigation={navigation as NavigationProp<ParamListBase>}
        onClose={() => setShareFriendsPost(null)}
      />

      <FeedComposerModal
        visible={composerOpen}
        token={token}
        onClose={() => setComposerOpen(false)}
        onPosted={handlePosted}
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
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE",
    zIndex: 10,
  },
  brand: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    letterSpacing: 0.2,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  topIconBtn: {
    position: "relative",
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  activityBadge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  activityBadgeText: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 9,
    color: "#fff",
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
  suggestionsBlock: {
    paddingTop: 18,
    paddingBottom: 18,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#EFEFEF",
  },
  suggestionsTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
    zIndex: 15,
  },
  centerMessage: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  centerTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    marginBottom: 10,
    textAlign: "center",
  },
  centerSubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
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
    marginBottom: 18,
  },
  emptyCta: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: Colors.dark,
  },
  emptyCtaLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#fff",
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
