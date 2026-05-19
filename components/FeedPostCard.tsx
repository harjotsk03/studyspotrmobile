import { useCallback, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Video, ResizeMode } from "expo-av";
import { EllipsisVertical, Users } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { RootStackParamList } from "../types/navigation";
import {
  deleteFeedPost,
  feedAuthorDisplayName,
  reportFeedPost,
  type FeedPost,
} from "../utils/feedApi";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import FeedPostOptionsSheet from "./FeedPostOptionsSheet";

type Props = {
  post: FeedPost;
  token: string | null;
  currentUserId?: string | null;
  onDeleted?: (postId: string) => void;
  onShareWithFriends?: () => void;
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

export default function FeedPostCard({
  post,
  token,
  currentUserId,
  onDeleted,
  onShareWithFriends,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width: windowWidth } = useWindowDimensions();
  const mediaWidth = Math.min(windowWidth - 40, 560);
  const [optionsOpen, setOptionsOpen] = useState(false);

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

  const openProfile = useCallback(() => {
    navigation.navigate("PublicProfile", { userId: post.author_id });
  }, [navigation, post.author_id]);

  const isOwner = Boolean(currentUserId && post.author_id === currentUserId);

  const onShare = useCallback(async () => {
    try {
      const first = post.media[0];
      const line =
        post.caption?.trim() || "Shared from StudySpotr friends feed.";
      const url =
        first?.type === "video" || first?.type === "image" ? first.url : "";
      await Share.share({
        message: url ? `${line}\n${url}` : line,
      });
    } catch {
      /* dismissed */
    }
  }, [post.caption, post.media]);

  const confirmDeletePost = useCallback(async () => {
    if (!token) return;
    await deleteFeedPost(token, post.id);
    onDeleted?.(post.id);
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
          style={styles.authorTap}
          onPress={openProfile}
          accessibilityRole="button"
          accessibilityLabel={`${displayName} profile`}
        >
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatarImg} />
          ) : (
            <View
              style={[styles.avatarFallback, { backgroundColor: avatarColor }]}
            >
              <Text style={styles.avatarInitial}>{initials}</Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.authorName} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.time}>{formatFeedTime(post.created_at)}</Text>
              {post.visibility === "friends_only" ? (
                <View style={styles.friendsBadge}>
                  <Users size={11} color="#666" strokeWidth={2.2} />
                  <Text style={styles.friendsBadgeLabel}>Friends only</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
        {token ? (
          <Pressable
            hitSlop={10}
            onPress={openPostOptions}
            accessibilityLabel="Post options"
          >
            <EllipsisVertical size={22} color="#888" strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {post.media.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaScrollContent}
        >
          {post.media.map((m, i) => (
            <View
              key={`${post.id}-m-${i}`}
              style={[
                styles.mediaSlide,
                { width: mediaWidth },
                i < post.media.length - 1 && styles.mediaSlideGap,
              ]}
            >
              {m.type === "video" ? (
                <Video
                  style={styles.mediaVideo}
                  source={{ uri: m.url }}
                  resizeMode={ResizeMode.COVER}
                  useNativeControls
                  isLooping={false}
                />
              ) : (
                <Image
                  source={{ uri: m.url }}
                  style={styles.mediaImage}
                  resizeMode="cover"
                />
              )}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

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
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  authorTap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
    gap: 12,
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eee",
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 16,
    color: Colors.dark,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  time: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
  friendsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#f3f3f3",
  },
  friendsBadgeLabel: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 11,
    color: "#666",
  },
  mediaScrollContent: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 2,
  },
  mediaSlide: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f2f2f2",
  },
  mediaSlideGap: {
    marginRight: 8,
  },
  mediaImage: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#eee",
  },
  mediaVideo: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#111",
  },
  caption: {
    marginTop: 12,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.dark,
  },
});
