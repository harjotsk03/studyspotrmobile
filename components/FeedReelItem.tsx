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
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Video, ResizeMode } from "expo-av";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share as ShareIcon,
  Volume2,
  VolumeX,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { RootStackParamList } from "../types/navigation";
import {
  deleteFeedPost,
  feedAuthorDisplayName,
  likeFeedPost,
  unlikeFeedPost,
  type FeedPost,
} from "../utils/feedApi";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

type Props = {
  post: FeedPost;
  /** False when another tab or a root-stack screen covers the feed */
  screenFocused: boolean;
  isActive: boolean;
  viewportHeight: number;
  viewportWidth: number;
  token: string | null;
  currentUserId?: string | null;
  onDeleted: (postId: string) => void;
  onMergePost: (postId: string, merge: Partial<FeedPost>) => void;
  onReplacePost: (post: FeedPost) => void;
  onOpenComments: () => void;
};

export default function FeedReelItem({
  post,
  screenFocused,
  isActive,
  viewportHeight,
  viewportWidth,
  token,
  currentUserId,
  onDeleted,
  onMergePost,
  onReplacePost,
  onOpenComments,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const burstScale = useRef(new Animated.Value(0)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<Video | null>(null);

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

  const playbackAllowed = screenFocused && isActive && playing;

  useEffect(() => {
    if (!playbackAllowed && media?.type === "video") {
      void videoRef.current?.pauseAsync?.();
    }
  }, [playbackAllowed, media?.type]);

  useEffect(() => {
    if (!isActive) {
      setPlaying(true);
    }
  }, [isActive]);

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
        Animated.delay(120),
        Animated.timing(burstOpacity, {
          toValue: 0,
          duration: 380,
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
      if (media?.type === "video") {
        setPlaying((p) => !p);
      }
    }, 280);
  }, [media?.type, onDoubleTapLike]);

  const openProfile = useCallback(() => {
    navigation.navigate("PublicProfile", { userId: post.author_id });
  }, [navigation, post.author_id]);

  const onShare = useCallback(async () => {
    try {
      const line =
        post.caption?.trim() ||
        "Shared from StudySpotr friends feed.";
      const url =
        media?.type === "video" || media?.type === "image"
          ? media.url
          : "";
      await Share.share({
        message: url ? `${line}\n${url}` : line,
      });
    } catch {
      /* dismissed */
    }
  }, [post.caption, media]);

  const openMenu = useCallback(() => {
    if (!token || !isOwner) return;
    Alert.alert("Post", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteFeedPost(token, post.id);
              onDeleted(post.id);
            } catch (e) {
              Alert.alert(
                "Error",
                e instanceof Error ? e.message : "Could not delete.",
              );
            }
          })();
        },
      },
    ]);
  }, [token, isOwner, post.id, onDeleted]);

  const bottomPad = Math.max(insets.bottom, 12) + 8;

  return (
    <View style={[styles.wrap, { height: viewportHeight, width: viewportWidth }]}>
      <Pressable style={styles.mediaTap} onPress={onMediaPress}>
        {media ? (
          media.type === "video" ? (
            <Video
              ref={videoRef}
              style={[styles.mediaFill, { width: viewportWidth, height: viewportHeight }]}
              source={{ uri: media.url }}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay={playbackAllowed}
              isMuted={muted}
              useNativeControls={false}
            />
          ) : (
            <Image
              source={{ uri: media.url }}
              style={[styles.mediaFill, { width: viewportWidth, height: viewportHeight }]}
              resizeMode="cover"
            />
          )
        ) : (
          <View
            style={[styles.mediaFallback, { width: viewportWidth, height: viewportHeight }]}
          >
            <Text style={styles.mediaFallbackText}>No media</Text>
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
          <Heart size={96} color="#ff2d55" fill="#ff2d55" strokeWidth={0} />
        </Animated.View>
      </Pressable>

      {isOwner ? (
        <Pressable
          style={[styles.menuBtn, { top: insets.top + 8 }]}
          hitSlop={8}
          onPress={openMenu}
        >
          <MoreHorizontal size={26} color="#fff" strokeWidth={2.2} />
        </Pressable>
      ) : null}

      {media?.type === "video" && playbackAllowed ? (
        <Pressable
          style={[styles.muteBtn, { bottom: 220 + bottomPad }]}
          onPress={() => setMuted((m) => !m)}
          hitSlop={12}
        >
          {muted ? (
            <VolumeX size={28} color="#fff" strokeWidth={2.2} />
          ) : (
            <Volume2 size={28} color="#fff" strokeWidth={2.2} />
          )}
        </Pressable>
      ) : null}

      <View style={[styles.rightRail, { bottom: 110 + bottomPad }]}>
        <Pressable
          style={styles.railBtn}
          onPress={() => void runLike(true)}
          hitSlop={8}
        >
          <Heart
            size={34}
            color="#fff"
            fill={post.viewer_has_liked ? "#ff2d55" : "transparent"}
            strokeWidth={2.2}
          />
          <Text style={styles.railCount}>{formatCount(post.like_count)}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={onOpenComments} hitSlop={8}>
          <MessageCircle size={32} color="#fff" strokeWidth={2.2} />
          <Text style={styles.railCount}>{formatCount(post.comments_count)}</Text>
        </Pressable>

        <Pressable style={styles.railBtn} onPress={() => void onShare()} hitSlop={8}>
          <ShareIcon size={30} color="#fff" strokeWidth={2.2} />
          <Text style={styles.railLabel}>Share</Text>
        </Pressable>
      </View>

      <View style={[styles.bottomInfo, { paddingBottom: bottomPad }]}>
        <Pressable style={styles.authorRow} onPress={openProfile}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFb, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarTx}>{initials}</Text>
            </View>
          )}
          <Text style={styles.authorName} numberOfLines={1}>
            {displayName}
          </Text>
        </Pressable>
        {post.caption ? (
          <Text style={styles.caption}>{post.caption}</Text>
        ) : null}
      </View>
    </View>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#000",
    position: "relative",
  },
  mediaTap: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaFill: {
    backgroundColor: "#111",
  },
  mediaFallback: {
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaFallbackText: {
    color: "#888",
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
  },
  burstHeart: {
    position: "absolute",
    alignSelf: "center",
    top: "38%",
  },
  menuBtn: {
    position: "absolute",
    right: 14,
    zIndex: 10,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 22,
  },
  muteBtn: {
    position: "absolute",
    right: 18,
    zIndex: 10,
    padding: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 22,
  },
  rightRail: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    gap: 20,
    zIndex: 10,
  },
  railBtn: {
    alignItems: "center",
    gap: 6,
  },
  railCount: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  railLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 12,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: {
    position: "absolute",
    left: 0,
    right: 72,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    zIndex: 10,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#444",
  },
  avatarFb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTx: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 16,
    color: Colors.dark,
  },
  authorName: {
    flex: 1,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 17,
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  caption: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 21,
    color: "#f5f5f5",
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
