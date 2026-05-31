import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useFocusEffect,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Heart, MessageCircle, Reply } from "lucide-react-native";
import SwipeableNotificationCard from "../components/SwipeableNotificationCard";
import UndoToast from "../components/UndoToast";
import { SkeletonList, SkeletonRow } from "../components/Skeleton";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import {
  useFeedInteractions,
  type FeedInteractionNotification,
  type NotificationActor,
} from "../context/FeedInteractionsContext";
import type { RootStackParamList } from "../types/navigation";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import { fetchFeedPostById } from "../utils/feedApi";

function formatActorName(actor?: NotificationActor | null) {
  if (!actor) return "";
  const fullName = [actor.first_name, actor.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || actor.username || "";
}

/**
 * Type-aware row title. The backend ships a generic title field but we
 * prefer to build it locally so the actor's name is always rendered the
 * same way (matching the InboxScreen's formatting) and so we can fall back
 * gracefully when an actor is missing (e.g. a deleted user).
 */
function formatTitle(item: FeedInteractionNotification): string {
  const who = formatActorName(item.actor) || "Someone";
  switch (item.type) {
    case "liked_your_post":
      return `${who} liked your post`;
    case "liked_your_comment":
      return `${who} liked your comment`;
    case "commented_on_your_post":
      return `${who} commented on your post`;
    case "replied_to_your_comment":
      return `${who} replied to your comment`;
    default:
      return item.title?.trim() || `${who} interacted with your post`;
  }
}

/**
 * Tiny, type-aware glyph rendered in the top-right of each row. Keeps the
 * type information glanceable at the skinny row height the design calls
 * for (no separator, no card chrome — every visual cue has to earn its
 * pixels).
 */
function TypeGlyph({ type }: { type: string | null | undefined }) {
  const color = Colors.accent;
  if (type === "liked_your_post" || type === "liked_your_comment") {
    return <Heart size={14} color={color} strokeWidth={2.2} />;
  }
  if (type === "commented_on_your_post") {
    return <MessageCircle size={14} color={color} strokeWidth={2.2} />;
  }
  if (type === "replied_to_your_comment") {
    return <Reply size={14} color={color} strokeWidth={2.2} />;
  }
  return null;
}

function formatRelativeTime(iso?: string | null): string {
  if (typeof iso !== "string" || !iso.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const ms = now - d.getTime();
  if (ms < 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function FeedInteractionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { token } = useAuth();
  const {
    notifications,
    loading,
    refreshing,
    error,
    refresh,
    markAllRead,
    remove,
    restore,
  } = useFeedInteractions();

  // Single-slot undo queue: each delete replaces the prior entry, so the
  // toast always reflects the most recent destructive action. Matches the
  // existing InboxScreen pattern.
  const [pendingUndo, setPendingUndo] =
    useState<FeedInteractionNotification | null>(null);

  // Auto-mark everything as read whenever this screen becomes the focused
  // surface. Done on focus (not mount) so it works when the user comes
  // back via navigation rather than only on first entry.
  useFocusEffect(
    useCallback(() => {
      void markAllRead().catch(() => {
        // Swallow — the next poll will reconcile.
      });
    }, [markAllRead]),
  );

  const handleDelete = useCallback(
    (notification: FeedInteractionNotification) => {
      setPendingUndo(notification);
      void remove(notification.id).catch((err) => {
        Alert.alert(
          "Error",
          err instanceof Error
            ? err.message
            : "Could not delete notification.",
        );
      });
    },
    [remove],
  );

  const handleUndo = useCallback(() => {
    const target = pendingUndo;
    if (!target) return;
    setPendingUndo(null);
    void restore(target).catch((err) => {
      Alert.alert(
        "Error",
        err instanceof Error
          ? err.message
          : "Could not restore notification.",
      );
    });
  }, [pendingUndo, restore]);

  const openTarget = useCallback(
    async (notification: FeedInteractionNotification) => {
      const postId =
        typeof notification.metadata?.post_id === "string"
          ? notification.metadata.post_id
          : null;
      if (!postId || !token) return;
      // For comment-related interactions, jump straight into the comments
      // modal. For post likes, just open the post.
      const shouldOpenComments =
        notification.type === "commented_on_your_post" ||
        notification.type === "replied_to_your_comment" ||
        notification.type === "liked_your_comment";
      // The backend tags every comment-related notification with the new
      // comment id in `comment_id`. That's the row the user wants to land
      // on — whether someone liked their comment or replied to it (the
      // reply itself is the new comment to highlight). Post likes don't
      // open comments so we pass null.
      const commentId =
        typeof notification.metadata?.comment_id === "string"
          ? notification.metadata.comment_id
          : null;
      const highlightCommentId = shouldOpenComments ? commentId : null;
      try {
        const post = await fetchFeedPostById(token, postId);
        if (!post) return;
        navigation.navigate("FeedPostDetail", {
          post,
          openComments: shouldOpenComments,
          highlightCommentId,
        });
      } catch {
        // Silently no-op — the row stays put, the user can try again.
      }
    },
    [navigation, token],
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedInteractionNotification }) => {
      const unread = !item.read_at;
      const actor = item.actor;
      const avatarUri =
        typeof actor?.profile_photo === "string" &&
        actor.profile_photo.trim().length > 0
          ? encodeURI(actor.profile_photo.trim())
          : "";
      const avatarUser = {
        id: actor?.id,
        first_name: actor?.first_name ?? undefined,
        last_name: actor?.last_name ?? undefined,
        username: actor?.username ?? undefined,
        name: formatActorName(actor),
      };
      return (
        <SwipeableNotificationCard onDelete={() => handleDelete(item)}>
          <Pressable
            onPress={() => void openTarget(item)}
            // The "skinny, no card" treatment the user asked for: flat
            // white surface, tight padding, and no border / radius / gap
            // between rows. The unread state still gets a faint left
            // accent so the user can quickly see what's new without any
            // additional chrome.
            style={[
              styles.row,
              unread && styles.rowUnread,
            ]}
          >
            <Pressable
              disabled={!actor?.id}
              onPress={() =>
                actor?.id
                  ? navigation.navigate("PublicProfile", { userId: actor.id })
                  : undefined
              }
              style={[
                styles.avatar,
                { backgroundColor: getUserAvatarColor(avatarUser) },
              ]}
            >
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.avatarText}>
                  {getUserInitials(avatarUser)}
                </Text>
              )}
            </Pressable>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={2}>
                {formatTitle(item)}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {formatRelativeTime(item.created_at)}
              </Text>
            </View>
            <View style={styles.trailing}>
              <TypeGlyph type={item.type} />
              {unread ? <View style={styles.unreadDot} /> : null}
            </View>
          </Pressable>
        </SwipeableNotificationCard>
      );
    },
    [handleDelete, navigation, openTarget],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>Activity</Text>
        <View style={[styles.iconButton, styles.iconHidden]} />
      </View>

      {loading && notifications.length === 0 ? (
        <SkeletonList
          count={8}
          style={styles.skeletonList}
          row={<SkeletonRow avatarSize={38} lines={2} />}
        />
      ) : !error && notifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No activity yet</Text>
          <Text style={styles.emptyText}>
            Likes, comments, and replies on your posts will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          // Edge-to-edge, no separators — every row hugs the next so the
          // list reads like one continuous activity stream rather than
          // discrete cards.
          ItemSeparatorComponent={null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            error ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>Could not load activity</Text>
                <Text style={styles.emptyText}>{error}</Text>
              </View>
            ) : null
          }
        />
      )}

      <UndoToast
        visible={!!pendingUndo}
        message="Notification deleted"
        onUndo={handleUndo}
        onHide={() => setPendingUndo(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
  },
  iconHidden: {
    opacity: 0,
  },
  headerTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 19,
    color: Colors.dark,
  },
  listContent: {
    paddingBottom: 24,
  },
  // ── Skinny row ─────────────────────────────────────────────────────────
  //
  // No borderRadius, no borderWidth, no marginVertical. Just a flat white
  // strip with a tight 10px vertical pad. Rows live edge-to-edge against
  // their neighbours, matching the user's "all cards but no gaps or
  // border" request.
  row: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowUnread: {
    backgroundColor: "#F8FBFF",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarText: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 15,
    color: "#fff",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: Colors.dark,
    lineHeight: 19,
  },
  meta: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#888",
  },
  trailing: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 14,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  skeletonList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    textAlign: "center",
  },
});
