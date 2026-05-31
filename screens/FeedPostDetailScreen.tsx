import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FeedCommentsModal from "../components/FeedCommentsModal";
import FeedInstaCard, { type MediaRect } from "../components/FeedInstaCard";
import FullScreenReelViewer from "../components/FullScreenReelViewer";
import ShareToFriendsSheet from "../components/ShareToFriendsSheet";
import { Colors } from "../constants/Colors";
import { useAuth } from "../context/AuthContext";
import type { FeedPost } from "../utils/feedApi";

export type FeedPostDetailParams = {
  post: FeedPost;
  /** When true, the comments modal opens automatically once the screen
   * mounts. Used by the feed-interactions screen so tapping a "commented
   * on your post" / "replied to your comment" notification lands the user
   * directly in the comment thread. */
  openComments?: boolean;
  /** When set, the auto-opened comments modal scrolls this comment into
   * view and highlights it in the brand accent so the user can see which
   * comment a "liked your comment" / "replied to your comment"
   * notification was referring to. */
  highlightCommentId?: string | null;
};

type Props = NativeStackScreenProps<
  { FeedPostDetail: FeedPostDetailParams },
  "FeedPostDetail"
>;

/**
 * Single-post detail screen used when a shared post is tapped from a chat
 * (or anywhere else we route into `FeedPostDetail`). Rendered with the same
 * `FeedInstaCard` the home feed uses, so likes, comments, the 3-dot options
 * sheet (report/delete), full-screen reel viewer, and share-with-friends
 * all behave identically to the feed — there's just one post in view.
 */
export default function FeedPostDetailScreen({ navigation, route }: Props) {
  const {
    post: initialPost,
    openComments: openCommentsInitially,
    highlightCommentId,
  } = route.params;
  const { token, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const currentUserId = profile?.userProfile?.id ?? null;

  // Mirror the feed's local post state so likes/comments/etc. update in
  // place after a server round-trip, without us needing to refetch.
  const [post, setPost] = useState<FeedPost>(initialPost);
  const [commentsOpen, setCommentsOpen] = useState(
    Boolean(openCommentsInitially),
  );
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [fullScreenPost, setFullScreenPost] = useState<FeedPost | null>(null);
  const [fullScreenRect, setFullScreenRect] = useState<MediaRect | null>(null);
  const [globalMuted, setGlobalMuted] = useState(true);

  const mergePost = useCallback(
    (id: string, merge: Partial<FeedPost>) => {
      setPost((prev) => (prev.id === id ? { ...prev, ...merge } : prev));
      setFullScreenPost((curr) =>
        curr && curr.id === id ? { ...curr, ...merge } : curr,
      );
    },
    [],
  );

  const replacePost = useCallback((fresh: FeedPost) => {
    setPost((prev) => (prev.id === fresh.id ? { ...prev, ...fresh } : prev));
    setFullScreenPost((curr) =>
      curr && curr.id === fresh.id ? { ...curr, ...fresh } : curr,
    );
  }, []);

  const handleDeleted = useCallback(
    (deletedId: string) => {
      // The post we're showing is gone — there's nothing left to look at on
      // this screen, so pop back to wherever we came from.
      if (deletedId === post.id) {
        navigation.goBack();
      }
    },
    [navigation, post.id],
  );

  const openFullScreen = useCallback(
    (target: FeedPost, rect: MediaRect) => {
      setFullScreenRect(rect);
      setFullScreenPost(target);
    },
    [],
  );

  const closeFullScreen = useCallback(() => {
    setFullScreenPost(null);
  }, []);

  // While the full-screen reel viewer is open, mark the underlying card as
  // inactive so its video pauses (same trick the home feed uses).
  const isActive = !fullScreenPost;

  return (
    <View style={styles.screen}>
      {/*
        Wrap everything *except* the full-screen reel viewer in a layer
        whose pointer events are turned off while the viewer is open, so
        the underlying ScrollView's native pan gesture can't swallow
        horizontal touches and block the reel's swipe-to-dismiss.
      */}
      <View
        style={styles.contentLayer}
        pointerEvents={fullScreenPost ? "none" : "auto"}
      >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!fullScreenPost}
      >
        <FeedInstaCard
          post={post}
          screenFocused={isFocused}
          isActive={isActive}
          token={token}
          currentUserId={currentUserId}
          globalMuted={globalMuted}
          onToggleMuted={() => setGlobalMuted((m) => !m)}
          onDeleted={handleDeleted}
          onMergePost={mergePost}
          onReplacePost={replacePost}
          onOpenComments={() => setCommentsOpen(true)}
          onShareWithFriends={
            token ? () => setShareSheetOpen(true) : undefined
          }
          onOpenFullScreen={openFullScreen}
        />
      </ScrollView>

      <FeedCommentsModal
        visible={commentsOpen}
        postId={commentsOpen ? post.id : null}
        token={token}
        currentUserId={currentUserId}
        commentsCount={post.comments_count ?? 0}
        highlightCommentId={highlightCommentId ?? null}
        onClose={() => setCommentsOpen(false)}
        onCommentsDelta={(delta) => {
          setPost((prev) => ({
            ...prev,
            comments_count: Math.max(0, (prev.comments_count ?? 0) + delta),
          }));
        }}
      />

      <ShareToFriendsSheet
        visible={shareSheetOpen}
        attachment={shareSheetOpen ? { kind: "post", post } : null}
        token={token}
        navigation={navigation as NavigationProp<ParamListBase>}
        onClose={() => setShareSheetOpen(false)}
      />
      </View>

      {/*
        Rendered LAST and at the outermost level so it lives outside the
        pointer-events-disabled content layer above; this keeps the reel
        viewer's swipe gesture isolated from any other touch handlers.
      */}
      <FullScreenReelViewer
        visible={Boolean(fullScreenPost)}
        post={fullScreenPost}
        fromRect={fullScreenRect}
        token={token}
        currentUserId={currentUserId}
        onClose={closeFullScreen}
        onMergePost={mergePost}
        onReplacePost={replacePost}
        onDeleted={handleDeleted}
        onOpenComments={() => setCommentsOpen(true)}
        onShareWithFriends={() => setShareSheetOpen(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  contentLayer: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 2,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  scrollContent: {
    paddingBottom: 32,
  },
});
