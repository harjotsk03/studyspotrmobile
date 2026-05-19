import { Audio } from "expo-av";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Plus, Activity } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FeedCommentsModal from "../components/FeedCommentsModal";
import FeedComposerModal from "../components/FeedComposerModal";
import FeedReelItem from "../components/FeedReelItem";
import SharePostToFriendsSheet from "../components/SharePostToFriendsSheet";
import TopNav from "../components/TopNav";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { UserProfileData } from "../context/AuthContext";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import type { MainTabsParamList } from "../types/navigation";
import { fetchFeedFriends, type FeedPost } from "../utils/feedApi";

const win = Dimensions.get("window");

type FeedTabNavigation = BottomTabNavigationProp<MainTabsParamList, "Feed">;

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

  const [viewport, setViewport] = useState({
    h: win.height,
    w: win.width,
  });
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
  const [overlaysSubdued, setOverlaysSubdued] = useState(false);

  const loadingMoreRef = useRef(false);

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
      setOverlaysSubdued(false);
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
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const top = viewableItems.find((v) => v.isViewable);
      const id =
        top?.item && typeof top.item === "object" && "id" in top.item
          ? String((top.item as FeedPost).id)
          : null;
      setActivePostId(id);
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 75,
  }).current;

  const reelH = Math.max(viewport.h, 1);
  const reelW = Math.max(viewport.w, 1);

  const commentsPost = commentsPostId
    ? posts.find((p) => p.id === commentsPostId)
    : undefined;

  const emptyCopy =
    "When friends share posts, they’ll show up here. Share something to start the conversation.";

  return (
    <View
      style={[styles.container, token ? styles.containerFeed : null]}
      onLayout={(e) => {
        const { height, width } = e.nativeEvent.layout;
        if (height > 0 && width > 0) {
          setViewport({ h: height, w: width });
        }
      }}
    >
      {!token ? <TopNav /> : null}

      {!token ? (
        <View style={styles.centerMessage}>
          <Text style={styles.centerTitle}>Sign in for your feed</Text>
          <Text style={styles.centerSubtitle}>
            Sign in to see posts from your friends.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            pagingEnabled
            snapToInterval={reelH}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            onScrollBeginDrag={() => setOverlaysSubdued(true)}
            onMomentumScrollEnd={() => setOverlaysSubdued(false)}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            windowSize={5}
            maxToRenderPerBatch={3}
            initialNumToRender={2}
            getItemLayout={(_, index) => ({
              length: reelH,
              offset: reelH * index,
              index,
            })}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            renderItem={({ item }) => (
              <FeedReelItem
                post={item}
                screenFocused={isFocused}
                isActive={item.id === activePostId}
                overlaysSubdued={overlaysSubdued}
                viewportHeight={reelH}
                viewportWidth={reelW}
                token={token}
                currentUserId={user?.id}
                onDeleted={handleDeleted}
                onMergePost={mergePost}
                onReplacePost={replacePost}
                onOpenComments={() => setCommentsPostId(item.id)}
                onShareWithFriends={() => setShareFriendsPost(item)}
              />
            )}
            ListEmptyComponent={
              loading ? (
                <View style={{ height: reelH }} />
              ) : (
                <View style={[styles.emptyWrap, { minHeight: reelH }]}>
                  <Text style={styles.emptyTextDark}>{emptyCopy}</Text>
                  <Pressable
                    style={styles.emptyCtaDark}
                    onPress={() => setComposerOpen(true)}
                  >
                    <Text style={styles.emptyCtaLabelDark}>Create a post</Text>
                  </Pressable>
                </View>
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor="#fff"
              />
            }
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.listFooterLoading}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null
            }
          />

          <View
            pointerEvents="box-none"
            style={[
              styles.topOverlay,
              {
                paddingTop: insets.top + 8,
                opacity: overlaysSubdued ? 0.38 : 1,
              },
            ]}
          >
            <View style={styles.topLeftCluster}>
              <Pressable
                onPress={() => setComposerOpen(true)}
                hitSlop={8}
                style={styles.addCircle}
                accessibilityRole="button"
                accessibilityLabel="Create post"
              >
                <Plus size={22} color="#fff" strokeWidth={2.4} />
              </Pressable>
              <Text style={styles.topBrand} numberOfLines={1}>
                Study Spotr
              </Text>
            </View>
            <Pressable
              onPress={() =>
                navigation.navigate({
                  name: "Inbox",
                  params: { screen: "InboxHome" },
                })
              }
              hitSlop={12}
              style={styles.activityButton}
              accessibilityRole="button"
              accessibilityLabel="Activity and notifications"
            >
              <Activity size={24} color="#fff" strokeWidth={2.2} />
              {unreadCount > 0 ? (
                <View style={styles.activityBadge}>
                  <Text style={styles.activityBadgeText}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {loading && posts.length === 0 ? (
            <View style={styles.loadingOverlayDark}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : null}

          {feedError ? (
            <View
              style={[styles.errorBannerDark, { bottom: 24 + insets.bottom }]}
            >
              <Text style={styles.errorTextDark}>{feedError}</Text>
              <Pressable onPress={() => void loadInitial()}>
                <Text style={styles.errorRetryDark}>Retry</Text>
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
        </>
      )}

      <SharePostToFriendsSheet
        visible={Boolean(shareFriendsPost)}
        post={shareFriendsPost}
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
    backgroundColor: Colors.light,
  },
  containerFeed: {
    backgroundColor: "#000",
  },
  topOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 12,
  },
  topLeftCluster: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: 10,
  },
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
  },
  topBrand: {
    flexShrink: 1,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    letterSpacing: 0.2,
  },
  activityButton: {
    position: "relative",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  activityBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  activityBadgeText: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 10,
    color: "#fff",
  },
  loadingOverlayDark: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
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
  emptyWrap: {
    paddingHorizontal: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTextDark: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#bbb",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 18,
  },
  emptyCtaDark: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  emptyCtaLabelDark: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#111",
  },
  errorBannerDark: {
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
    backgroundColor: "rgba(40,20,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,120,120,0.35)",
    zIndex: 25,
  },
  errorTextDark: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#fecaca",
  },
  errorRetryDark: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#fff",
  },
  listFooterLoading: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
});
