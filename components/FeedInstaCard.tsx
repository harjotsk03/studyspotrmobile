import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Video, ResizeMode } from "expo-av";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { RootStackParamList } from "../types/navigation";
import {
  deleteFeedPost,
  feedAuthorDisplayName,
  likeFeedPost,
  reportFeedPost,
  unlikeFeedPost,
  type FeedPost,
} from "../utils/feedApi";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import FeedPostOptionsSheet from "./FeedPostOptionsSheet";

type Props = {
  post: FeedPost;
  screenFocused: boolean;
  isActive: boolean;
  token: string | null;
  currentUserId?: string | null;
  /** Muted state is controlled by parent so it persists across cards. */
  globalMuted: boolean;
  onToggleMuted: () => void;
  onDeleted: (postId: string) => void;
  onMergePost: (postId: string, merge: Partial<FeedPost>) => void;
  onReplacePost: (post: FeedPost) => void;
  onOpenComments: () => void;
  onShareWithFriends?: () => void;
  /** Called when the user taps a video — opens the full screen reel viewer. */
  onOpenFullScreen: (post: FeedPost, mediaRect: MediaRect) => void;
};

export type MediaRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function formatFeedTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function FeedInstaCard({
  post,
  screenFocused,
  isActive,
  token,
  currentUserId,
  globalMuted,
  onToggleMuted,
  onDeleted,
  onMergePost,
  onReplacePost,
  onOpenComments,
  onShareWithFriends,
  onOpenFullScreen,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: windowWidth } = useWindowDimensions();
  const mediaWidth = windowWidth;
  // 5:4 portrait aspect feels native to Instagram (taller than square).
  const mediaHeight = Math.round((mediaWidth * 5) / 4);

  const burstScale = useRef(new Animated.Value(0)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const heartRailScale = useRef(new Animated.Value(1)).current;
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaContainerRef = useRef<View | null>(null);
  const videoRef = useRef<Video | null>(null);
  const prevPostIdRef = useRef(post.id);
  const prevViewerLikedRef = useRef(post.viewer_has_liked);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const media = post.media[0];
  const author = post.author;
  const displayName = feedAuthorDisplayName(author);
  const initialsUser = author
    ? {
        id: author.id,
        first_name: author.first_name ?? undefined,
        last_name: author.last_name ?? undefined,
        username: author.username ?? undefined,
        name: displayName,
      }
    : { id: post.author_id, name: displayName };
  const avatarColor = getUserAvatarColor(initialsUser);
  const initials = getUserInitials(initialsUser);
  const photo =
    typeof author?.profile_photo === "string" && author.profile_photo.trim()
      ? author.profile_photo.trim()
      : "";

  const isOwner = Boolean(currentUserId && post.author_id === currentUserId);
  const isVideo = media?.type === "video";
  const shouldAutoplay = isVideo && screenFocused && isActive;

  useEffect(() => {
    if (!shouldAutoplay) {
      void videoRef.current?.pauseAsync?.();
    }
  }, [shouldAutoplay]);

  useEffect(() => {
    if (post.id !== prevPostIdRef.current) {
      prevPostIdRef.current = post.id;
      prevViewerLikedRef.current = post.viewer_has_liked;
      heartRailScale.setValue(1);
      return;
    }
    const liked = post.viewer_has_liked;
    if (liked && !prevViewerLikedRef.current) {
      heartRailScale.setValue(1);
      Animated.sequence([
        Animated.spring(heartRailScale, {
          toValue: 1.3,
          friction: 5,
          tension: 320,
          useNativeDriver: true,
        }),
        Animated.spring(heartRailScale, {
          toValue: 1,
          friction: 8,
          tension: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevViewerLikedRef.current = liked;
  }, [post.id, post.viewer_has_liked, heartRailScale]);

  const showBurst = useCallback(() => {
    burstScale.setValue(0.6);
    burstOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(burstScale, {
        toValue: 1.15,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(140),
        Animated.timing(burstOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [burstOpacity, burstScale]);

  const runLike = useCallback(
    async (optimistic: boolean) => {
      if (!token) return;
      const liked = post.viewer_has_liked;
      const nextLiked = !liked;
      const delta = nextLiked ? 1 : -1;

      if (optimistic) {
        onMergePost(post.id, {
          viewer_has_liked: nextLiked,
          like_count: Math.max(0, post.like_count + delta),
        });
      }

      try {
        const updated = nextLiked
          ? await likeFeedPost(token, post.id)
          : await unlikeFeedPost(token, post.id);
        if (updated) {
          onReplacePost(updated);
        }
      } catch {
        if (optimistic) {
          onMergePost(post.id, {
            viewer_has_liked: liked,
            like_count: post.like_count,
          });
        }
        Alert.alert("Couldn’t update like", "Try again.");
      }
    },
    [token, post, onMergePost, onReplacePost],
  );

  const measureAndOpenFullScreen = useCallback(() => {
    const node = mediaContainerRef.current;
    if (!node) {
      onOpenFullScreen(post, {
        x: 0,
        y: 0,
        width: mediaWidth,
        height: mediaHeight,
      });
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      onOpenFullScreen(post, { x, y, width, height });
    });
  }, [onOpenFullScreen, post, mediaWidth, mediaHeight]);

  const onDoubleTapLike = useCallback(() => {
    showBurst();
    if (!post.viewer_has_liked) {
      void runLike(true);
    }
  }, [post.viewer_has_liked, runLike, showBurst]);

  const onMediaPress = useCallback(() => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      onDoubleTapLike();
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      if (isVideo) {
        measureAndOpenFullScreen();
      }
    }, 240);
  }, [isVideo, onDoubleTapLike, measureAndOpenFullScreen]);

  const openProfile = useCallback(() => {
    navigation.navigate("PublicProfile", { userId: post.author_id });
  }, [navigation, post.author_id]);

  const onShare = useCallback(async () => {
    try {
      const line =
        post.caption?.trim() || "Shared from Study Spotr friends feed.";
      const url =
        media?.type === "video" || media?.type === "image" ? media.url : "";
      await Share.share({
        message: url ? `${line}\n${url}` : line,
      });
    } catch {
      /* dismissed */
    }
  }, [post.caption, media]);

  const confirmDeletePost = useCallback(async () => {
    if (!token) return;
    await deleteFeedPost(token, post.id);
    onDeleted(post.id);
  }, [token, post.id, onDeleted]);

  const confirmReportPost = useCallback(async () => {
    if (!token) return;
    await reportFeedPost(token, post.id);
  }, [token, post.id]);

  const openPostOptions = useCallback(() => {
    if (!token) return;
    setOptionsOpen(true);
  }, [token]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          onPress={openProfile}
          accessibilityRole="button"
          accessibilityLabel={`${displayName} profile`}
        >
          <View style={styles.avatarRing}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImg} />
            ) : (
              <View
                style={[styles.avatarFb, { backgroundColor: avatarColor }]}
              >
                <Text style={styles.avatarTx}>{initials}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.headerMeta} numberOfLines={1}>
              {formatFeedTime(post.created_at)}
              {post.visibility === "friends_only" ? " · Friends" : ""}
            </Text>
          </View>
        </Pressable>
        {token ? (
          <Pressable
            hitSlop={10}
            onPress={openPostOptions}
            accessibilityLabel="Post options"
          >
            <MoreHorizontal size={22} color={Colors.dark} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      <View
        ref={mediaContainerRef}
        collapsable={false}
        style={[
          styles.mediaWrap,
          { width: mediaWidth, height: mediaHeight },
        ]}
      >
        <Pressable style={styles.mediaTap} onPress={onMediaPress}>
          {media ? (
            isVideo ? (
              <Video
                ref={videoRef}
                style={[
                  styles.mediaFill,
                  { width: mediaWidth, height: mediaHeight },
                ]}
                source={{ uri: media.url }}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay={shouldAutoplay}
                isMuted={globalMuted}
                useNativeControls={false}
              />
            ) : (
              <Image
                source={{ uri: media.url }}
                style={[
                  styles.mediaFill,
                  { width: mediaWidth, height: mediaHeight },
                ]}
                resizeMode="cover"
              />
            )
          ) : (
            <View
              style={[
                styles.mediaFallback,
                { width: mediaWidth, height: mediaHeight },
              ]}
            >
              <Text style={styles.mediaFallbackTx}>No media</Text>
            </View>
          )}

          <Animated.View
            pointerEvents="none"
            style={[
              styles.burstHeart,
              {
                opacity: burstOpacity,
                transform: [{ scale: burstScale }],
              },
            ]}
          >
            <Heart size={108} color="#fff" fill="#fff" strokeWidth={0} />
          </Animated.View>
        </Pressable>

        {isVideo ? (
          <Pressable
            style={styles.muteBtn}
            onPress={onToggleMuted}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={globalMuted ? "Unmute video" : "Mute video"}
          >
            {globalMuted ? (
              <VolumeX size={16} color="#fff" strokeWidth={2.4} />
            ) : (
              <Volume2 size={16} color="#fff" strokeWidth={2.4} />
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <View style={styles.actionsLeft}>
          <Pressable
            onPress={() => void runLike(true)}
            hitSlop={8}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={post.viewer_has_liked ? "Unlike" : "Like"}
          >
            <Animated.View style={{ transform: [{ scale: heartRailScale }] }}>
              <Heart
                size={26}
                color={post.viewer_has_liked ? "#ED1C5A" : Colors.dark}
                fill={post.viewer_has_liked ? "#ED1C5A" : "transparent"}
                strokeWidth={2.1}
              />
            </Animated.View>
          </Pressable>
          <Pressable
            onPress={onOpenComments}
            hitSlop={8}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="View comments"
          >
            <MessageCircle size={25} color={Colors.dark} strokeWidth={2.1} />
          </Pressable>
          <Pressable
            onPress={() => {
              if (token && onShareWithFriends) onShareWithFriends();
              else void onShare();
            }}
            hitSlop={8}
            style={styles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel="Send post"
          >
            <Send size={24} color={Colors.dark} strokeWidth={2.1} />
          </Pressable>
        </View>
      </View>

      <View style={styles.metaWrap}>
        {post.like_count > 0 ? (
          <Text style={styles.likeCount}>
            {formatCount(post.like_count)}{" "}
            {post.like_count === 1 ? "like" : "likes"}
          </Text>
        ) : null}

        {post.caption ? (
          <Text style={styles.captionLine} numberOfLines={3}>
            <Text style={styles.captionName} onPress={openProfile}>
              {displayName}
            </Text>
            <Text>  </Text>
            <Text style={styles.captionText}>{post.caption}</Text>
          </Text>
        ) : null}

        {post.comments_count > 0 ? (
          <Pressable onPress={onOpenComments} hitSlop={6}>
            <Text style={styles.viewComments}>
              View {post.comments_count === 1 ? "1 comment" : `all ${formatCount(post.comments_count)} comments`}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.timeAgo}>{formatFeedTime(post.created_at)}</Text>
      </View>

      <FeedPostOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        isOwner={isOwner}
        onShare={onShare}
        onShareWithFriends={
          token && onShareWithFriends ? onShareWithFriends : undefined
        }
        onDeleteConfirmed={confirmDeletePost}
        onReportConfirmed={confirmReportPost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  avatarRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    padding: 1.5,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    backgroundColor: "#eee",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarFb: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarTx: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 13,
    color: "#fff",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.dark,
  },
  headerMeta: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 11,
    color: "#777",
    marginTop: 1,
  },
  mediaWrap: {
    backgroundColor: "#111",
    position: "relative",
    overflow: "hidden",
  },
  mediaTap: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaFill: {
    backgroundColor: "#111",
  },
  mediaFallback: {
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaFallbackTx: {
    color: "#888",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
  },
  burstHeart: {
    position: "absolute",
    alignSelf: "center",
    top: "38%",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  muteBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  actionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  actionBtn: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  metaWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 4,
  },
  likeCount: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.dark,
  },
  captionLine: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 19,
    color: Colors.dark,
  },
  captionName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.dark,
  },
  captionText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: Colors.dark,
  },
  viewComments: {
    marginTop: 2,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#7a7a7a",
  },
  timeAgo: {
    marginTop: 2,
    fontFamily: Fonts.instrument.regular,
    fontSize: 11,
    color: "#9a9a9a",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
