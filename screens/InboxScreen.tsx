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
import { useEffect, useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, UserPlus } from "lucide-react-native";
import TopNav from "../components/TopNav";
import Button from "../components/Button";
import SwipeableNotificationCard from "../components/SwipeableNotificationCard";
import UndoToast from "../components/UndoToast";
import { SkeletonList, SkeletonRow } from "../components/Skeleton";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import {
  useNotifications,
  type NotificationActor,
  type NotificationItem,
} from "../context/NotificationsContext";
import type {
  InboxStackParamList,
  RootStackParamList,
} from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import { fetchFeedPostById } from "../utils/feedApi";
import { createDirectConversation } from "../utils/chatApi";

function formatActorName(actor?: NotificationActor | null) {
  if (!actor) return "";

  const fullName = [actor.first_name, actor.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || actor.username || "";
}

function formatNotificationTitle(notification: NotificationItem) {
  const title = notification.title?.trim();
  if (title) return title;

  const actorName = formatActorName(notification.actor);
  const communityName = notification.community?.name?.trim();

  if (notification.type === "friend_request") {
    return actorName
      ? `${actorName} sent you a friend request`
      : "New friend request";
  }

  if (notification.type === "friend_request_accepted") {
    return actorName
      ? `${actorName} accepted your follow request`
      : "Follow request accepted";
  }

  if (notification.type === "community_join_request") {
    if (actorName && communityName) {
      return `${actorName} requested to join ${communityName}`;
    }

    return communityName
      ? `New request to join ${communityName}`
      : "New community join request";
  }

  if (notification.type === "accepted_to_community") {
    return communityName
      ? `You're now a member of ${communityName}`
      : "You've been accepted into a community";
  }

  if (notification.type === "event_invite") {
    if (actorName && communityName) {
      return `${actorName} invited you to an event in ${communityName}`;
    }
    if (actorName) return `${actorName} invited you to an event`;
    if (communityName) return `Event invite in ${communityName}`;
    return "You've been invited to an event";
  }

  const who = actorName || "Someone";
  if (notification.type === "liked_your_post") {
    return `${who} liked your post`;
  }
  if (notification.type === "liked_your_comment") {
    return `${who} liked your comment`;
  }
  if (notification.type === "commented_on_your_post") {
    return `${who} commented on your post`;
  }
  if (notification.type === "replied_to_your_comment") {
    return `${who} replied to your comment`;
  }

  if (actorName && communityName) {
    return `${actorName} in ${communityName}`;
  }

  return actorName || communityName || "New notification";
}

function formatNotificationBody(notification: NotificationItem) {
  const body =
    notification.message?.trim() ||
    notification.body?.trim() ||
    notification.content?.trim();

  if (body) return body;

  if (notification.type === "friend_request") {
    return "Open the request to respond.";
  }

  if (notification.type === "friend_request_accepted") {
    return "Tap to view their profile.";
  }

  if (notification.type === "community_join_request") {
    return "Review this community membership request.";
  }

  if (notification.type === "accepted_to_community") {
    return "Tap to open the community.";
  }

  if (notification.type === "event_invite") {
    return "Tap to view the event and RSVP.";
  }

  if (
    notification.type === "liked_your_post" ||
    notification.type === "liked_your_comment" ||
    notification.type === "commented_on_your_post" ||
    notification.type === "replied_to_your_comment"
  ) {
    return "Tap to view the post.";
  }

  return "You have a new update.";
}

function formatNotificationTypeLabel(type?: string | null) {
  if (type === "community_join_request") return "Community request";
  if (type === "accepted_to_community") return "Community";
  if (type === "event_invite") return "Event invite";
  if (type === "liked_your_post" || type === "liked_your_comment") return "Like";
  if (type === "commented_on_your_post") return "Comment";
  if (type === "replied_to_your_comment") return "Reply";
  return "";
}

/** The actor's handle if known (compact, Instagram-style), else full name. */
function formatActorHandle(actor?: NotificationActor | null) {
  const username = actor?.username?.trim();
  return username || formatActorName(actor);
}

/** Splits a notification into a bold lead (who) and the rest of the
 * sentence, so rows read like "name liked your post. 4h". */
function describeNotification(notification: NotificationItem): {
  name: string;
  text: string;
} {
  const name = formatActorHandle(notification.actor);
  const community = notification.community?.name?.trim();

  switch (notification.type) {
    case "friend_request":
      return { name: name || "Someone", text: "requested to follow you." };
    case "friend_request_accepted":
      return { name: name || "Someone", text: "accepted your follow request." };
    case "community_join_request":
      return {
        name: name || "Someone",
        text: community
          ? `requested to join ${community}.`
          : "requested to join your community.",
      };
    case "accepted_to_community":
      return {
        name: "",
        text: community
          ? `You're now a member of ${community}.`
          : "You've been accepted into a community.",
      };
    case "event_invite":
      return {
        name: name || "Someone",
        text: community
          ? `invited you to an event in ${community}.`
          : "invited you to an event.",
      };
    case "liked_your_post":
      return { name: name || "Someone", text: "liked your post." };
    case "liked_your_comment":
      return { name: name || "Someone", text: "liked your comment." };
    case "commented_on_your_post":
      return { name: name || "Someone", text: "commented on your post." };
    case "replied_to_your_comment":
      return { name: name || "Someone", text: "replied to your comment." };
    default:
      return { name: "", text: formatNotificationTitle(notification) };
  }
}

/** Short Instagram-style age: 5m, 3h, 4d, 2w, then "Nov 6". */
function formatNotificationAge(iso?: string | null) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 35) return `${Math.floor(days / 7)}w`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function notificationSection(iso?: string | null) {
  const then = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(then)) return "Earlier";
  const days = (Date.now() - then) / 86400000;
  if (days < 1) return "Today";
  if (days < 7) return "Last 7 days";
  if (days < 30) return "Last 30 days";
  return "Earlier";
}

type ListEntry =
  | { kind: "header"; key: string; label: string }
  | { kind: "item"; key: string; item: NotificationItem };

/** Only comment-like notifications carry a quotable text snippet. */
function notificationSnippet(notification: NotificationItem) {
  if (
    notification.type !== "commented_on_your_post" &&
    notification.type !== "replied_to_your_comment" &&
    notification.type !== "liked_your_comment"
  ) {
    return "";
  }
  return (
    notification.message?.trim() ||
    notification.body?.trim() ||
    notification.content?.trim() ||
    ""
  );
}

function formatFollowRequestSummary(requests: NotificationItem[]) {
  if (requests.length === 0) return "No pending requests";

  const firstUsername =
    requests[0]?.actor?.username?.trim() ||
    formatActorName(requests[0]?.actor) ||
    "Someone";
  const formattedUsername = firstUsername.startsWith("@")
    ? firstUsername
    : `@${firstUsername}`;

  if (requests.length === 1) return formattedUsername;

  const otherCount = requests.length - 1;
  return `${formattedUsername} + ${otherCount} other${
    otherCount === 1 ? "" : "s"
  }`;
}


export default function InboxScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { token } = useAuth();
  const {
    notifications,
    loading,
    refreshing,
    error,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    restoreNotification,
    respondToFriendRequest,
  } = useNotifications();

  /**
   * Holds the most recently deleted notification so the undo toast can
   * restore it. Single-slot by design: a new delete replaces this entry,
   * which means once a toast disappears (or is replaced), the previous
   * deletion becomes permanent — matching Gmail / Mail's behavior.
   */
  const [pendingUndo, setPendingUndo] = useState<NotificationItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const respondInline = async (
    notification: NotificationItem,
    decision: "accept" | "reject",
  ) => {
    const friendId = notification.actor?.id ?? notification.actor_user_id;
    if (!friendId) return;
    setBusyId(notification.id);
    try {
      await respondToFriendRequest(friendId, decision);
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not respond to request.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const messageActor = async (notification: NotificationItem) => {
    const userId = notification.actor?.id ?? notification.actor_user_id;
    if (!userId || !token) return;
    setBusyId(notification.id);
    try {
      const r = await createDirectConversation(token, userId);
      rootNavigation.navigate("ChatThread", {
        conversationId: r.conversation.id,
        peer: r.other_user ?? undefined,
      });
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not open chat.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteNotification = (notification: NotificationItem) => {
    void deleteNotification(notification.id).catch((err) => {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not delete notification.",
      );
    });
    // Capture the full notification snapshot (not just the id) so the undo
    // path can call restore + re-insert with the original read_at, type,
    // etc. preserved.
    setPendingUndo(notification);
  };

  const handleUndoDelete = () => {
    const target = pendingUndo;
    if (!target) return;
    setPendingUndo(null);
    void restoreNotification(target).catch((err) => {
      Alert.alert(
        "Error",
        err instanceof Error
          ? err.message
          : "Could not restore notification.",
      );
    });
  };

  const buildCommunityStub = (notification: NotificationItem) => {
    const communityId =
      notification.community?.id ??
      notification.community_id ??
      (typeof notification.metadata?.community_id === "string"
        ? notification.metadata.community_id
        : undefined);
    if (!communityId) return null;

    return {
      id: communityId,
      name: notification.community?.name ?? "",
      members: 0,
      description: "",
      color: Colors.primary,
      memberAvatars: [] as string[],
    };
  };

  const openCommunityJoinRequest = (notification: NotificationItem) => {
    const community = buildCommunityStub(notification);
    if (!community) return;

    const actorId =
      notification.actor?.id ?? notification.actor_user_id ?? undefined;

    rootNavigation.navigate("CommunityDetail", {
      community,
      openMembers: true,
      highlightMemberUserId: actorId,
    });
  };

  const openCommunityDetail = (notification: NotificationItem) => {
    const community = buildCommunityStub(notification);
    if (!community) return;

    rootNavigation.navigate("CommunityDetail", { community });
  };

  const openActorProfile = (notification: NotificationItem) => {
    const userId = notification.actor?.id ?? notification.actor_user_id;
    if (!userId) return;
    rootNavigation.navigate("PublicProfile", { userId });
  };

  const openEventInvite = (notification: NotificationItem) => {
    const metadata = (notification.metadata ?? {}) as Record<string, unknown>;
    const rawEventId = metadata.event_id;
    const eventId =
      typeof rawEventId === "string" && rawEventId.trim().length > 0
        ? rawEventId.trim()
        : null;

    // Metadata may also carry the community id, but the canonical source
    // is the notification row's own community_id / hydrated community
    // object. Prefer those, then fall back to metadata.
    const rawMetaCommunityId = metadata.community_id;
    const communityId =
      notification.community?.id ??
      notification.community_id ??
      (typeof rawMetaCommunityId === "string" && rawMetaCommunityId.trim()
        ? rawMetaCommunityId.trim()
        : null);

    if (!eventId || !communityId) return;

    // The `CommunityEvents` screen already knows how to auto-open the
    // `EventDetailDrawer` for a given event id (`openEventId`), and
    // refreshes the user's role + community membership on focus, so we
    // don't need to plumb those through here. Default to the permissive
    // values so the screen doesn't kick a non-member invitee out before
    // its own membership check resolves.
    rootNavigation.navigate("CommunityEvents", {
      communityId,
      communityName: notification.community?.name ?? "",
      isAdmin: false,
      communityIsPublic: true,
      openEventId: eventId,
    });
  };

  const openFeedInteraction = async (notification: NotificationItem) => {
    const postId =
      typeof notification.metadata?.post_id === "string"
        ? notification.metadata.post_id
        : null;
    if (!postId || !token) return;
    const shouldOpenComments =
      notification.type === "commented_on_your_post" ||
      notification.type === "replied_to_your_comment" ||
      notification.type === "liked_your_comment";
    const commentId =
      typeof notification.metadata?.comment_id === "string"
        ? notification.metadata.comment_id
        : null;
    try {
      const post = await fetchFeedPostById(token, postId);
      if (!post) return;
      rootNavigation.navigate("FeedPostDetail", {
        post,
        openComments: shouldOpenComments,
        highlightCommentId: shouldOpenComments ? commentId : null,
      });
    } catch {
      // Row stays put; user can try again.
    }
  };

  const handleNotificationPress = (notification: NotificationItem) => {
    if (!notification.read_at) {
      void markNotificationRead(notification.id).catch((err) => {
        Alert.alert(
          "Error",
          err instanceof Error
            ? err.message
            : "Could not mark notification as read.",
        );
      });
    }

    if (notification.type === "community_join_request") {
      openCommunityJoinRequest(notification);
    } else if (notification.type === "accepted_to_community") {
      openCommunityDetail(notification);
    } else if (notification.type === "friend_request_accepted") {
      openActorProfile(notification);
    } else if (notification.type === "event_invite") {
      openEventInvite(notification);
    } else if (
      notification.type === "liked_your_post" ||
      notification.type === "liked_your_comment" ||
      notification.type === "commented_on_your_post" ||
      notification.type === "replied_to_your_comment"
    ) {
      void openFeedInteraction(notification);
    }
  };
  const friendRequests = notifications.filter(
    (notification) => notification.type === "friend_request",
  );
  const visibleNotifications = notifications.filter(
    (notification) => notification.type !== "friend_request",
  );
  const listEntries = useMemo<ListEntry[]>(() => {
    const sorted = [...notifications].sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime(),
    );
    const out: ListEntry[] = [];
    let last = "";
    for (const item of sorted) {
      const label = notificationSection(item.created_at);
      if (label !== last) {
        out.push({ kind: "header", key: `h-${label}`, label });
        last = label;
      }
      out.push({ kind: "item", key: item.id, item });
    }
    return out;
  }, [notifications]);
  const unreadFollowRequests = friendRequests.some((n) => !n.read_at);
  const firstRequester = friendRequests[0]?.actor ?? null;
  const unreadVisibleNotificationIds = visibleNotifications
    .filter((notification) => !notification.read_at)
    .map((notification) => notification.id)
    .join(",");
  const visibleUnreadCount = visibleNotifications.filter(
    (notification) => !notification.read_at,
  ).length;

  useEffect(() => {
    if (!unreadVisibleNotificationIds) return;

    const notificationIds = unreadVisibleNotificationIds.split(",");
    void Promise.all(
      notificationIds.map((notificationId) =>
        markNotificationRead(notificationId),
      ),
    ).catch(() => {
      // Polling will keep the inbox consistent if a read call fails.
    });
  }, [markNotificationRead, unreadVisibleNotificationIds]);

  return (
    <View style={styles.container}>
      <TopNav />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {visibleUnreadCount > 0 && (
            <Pressable
              onPress={() =>
                void markAllNotificationsRead().catch((err) => {
                  Alert.alert(
                    "Error",
                    err instanceof Error
                      ? err.message
                      : "Could not mark notifications as read.",
                  );
                })
              }
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          )}
        </View>
        {visibleUnreadCount > 0 && (
          <Text style={styles.unreadText}>
            {visibleUnreadCount} unread notification
            {visibleUnreadCount === 1 ? "" : "s"}
          </Text>
        )}
      </View>

      <View style={styles.notificationsPane}>
        {true ? (
          <Pressable
            style={styles.ctaRow}
            onPress={() =>
              navigation.navigate(
                "FriendRequests",
                friendRequests.length === 0 ? { tab: "sent" } : undefined,
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Follow requests"
          >
            {firstRequester ? (
              <View
                style={[
                  styles.ctaAvatar,
                  {
                    backgroundColor: getUserAvatarColor({
                      id: firstRequester.id,
                      username: firstRequester.username ?? undefined,
                    }),
                  },
                ]}
              >
                {typeof firstRequester.profile_photo === "string" &&
                firstRequester.profile_photo.trim() ? (
                  <Image
                    source={{ uri: encodeURI(firstRequester.profile_photo.trim()) }}
                    style={styles.ctaAvatarImg}
                  />
                ) : (
                  <Text style={styles.avatarText}>
                    {getUserInitials({
                      id: firstRequester.id,
                      first_name: firstRequester.first_name ?? undefined,
                      last_name: firstRequester.last_name ?? undefined,
                      username: firstRequester.username ?? undefined,
                    })}
                  </Text>
                )}
              </View>
            ) : (
              <View style={[styles.ctaAvatar, styles.ctaAvatarEmpty]}>
                <UserPlus size={22} color={Colors.dark} strokeWidth={2} />
              </View>
            )}
            <View style={styles.ctaCopy}>
              <Text style={styles.ctaTitle}>Follow requests</Text>
              <Text style={styles.ctaSubtitle} numberOfLines={1}>
                {friendRequests.length > 0
                  ? formatFollowRequestSummary(friendRequests)
                  : "Sent requests and pending follows"}
              </Text>
            </View>
            {unreadFollowRequests ? <View style={styles.unreadDot} /> : null}
            <ChevronRight size={20} color="#9AA0A6" strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <View style={styles.notificationsSection}>
          {loading && (
            <SkeletonList
              count={4}
              style={styles.listContent}
              row={<SkeletonRow avatarSize={42} lines={3} />}
            />
          )}

          {!loading && !!error && (
            <View style={styles.stateCard}>
              <Text style={styles.emptyTitle}>Could not load inbox</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          )}

          {!loading && !error && (
            <FlatList
              style={styles.notificationsList}
              data={listEntries}
              keyExtractor={(entry) => entry.key}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void refreshNotifications()}
                  tintColor={Colors.primary}
                />
              }
              ListEmptyComponent={
                <View style={styles.stateCard}>
                  <Text style={styles.emptyTitle}>No notifications yet</Text>
                  <Text style={styles.emptyText}>
                    Likes, comments, community invites, and updates will show up here.
                  </Text>
                </View>
              }
              renderItem={({ item: entry }) => {
                if (entry.kind === "header") {
                  return (
                    <Text style={styles.sectionHeader}>{entry.label}</Text>
                  );
                }
                const item = entry.item;
                const unread = !item.read_at;
                const actorName = formatActorName(item.actor);
                const { name, text } = describeNotification(item);
                const age = formatNotificationAge(item.created_at);
                const snippet = notificationSnippet(item);
                const isRequest = item.type === "friend_request";
                const canMessage = item.type === "friend_request_accepted";
                const busy = busyId === item.id;
                const actorAvatarUri =
                  typeof item.actor?.profile_photo === "string" &&
                  item.actor.profile_photo.trim().length > 0
                    ? encodeURI(item.actor.profile_photo.trim())
                    : "";
                const avatarUser = {
                  id: item.actor?.id ?? item.community?.id,
                  first_name: item.actor?.first_name ?? undefined,
                  last_name: item.actor?.last_name ?? undefined,
                  username: item.actor?.username ?? undefined,
                  name: actorName || item.community?.name || "",
                };

                return (
                  <SwipeableNotificationCard
                    onDelete={() => handleDeleteNotification(item)}
                  >
                    <Pressable
                      style={styles.notificationRow}
                      onPress={() =>
                        isRequest
                          ? openActorProfile(item)
                          : handleNotificationPress(item)
                      }
                    >
                      <Pressable
                        disabled={!item.actor?.id}
                        onPress={() => openActorProfile(item)}
                        style={[
                          styles.avatar,
                          { backgroundColor: getUserAvatarColor(avatarUser) },
                        ]}
                      >
                        {actorAvatarUri ? (
                          <Image
                            source={{ uri: actorAvatarUri }}
                            style={styles.avatarImage}
                          />
                        ) : (
                          <Text style={styles.avatarText}>
                            {getUserInitials(avatarUser)}
                          </Text>
                        )}
                      </Pressable>
                      <View style={styles.notificationBody}>
                        <Text style={styles.notificationLine} numberOfLines={4}>
                          {name ? (
                            <Text style={styles.notificationName}>{name} </Text>
                          ) : null}
                          {text}
                          {age ? (
                            <Text style={styles.notificationAge}>  {age}</Text>
                          ) : null}
                        </Text>
                        {snippet ? (
                          <Text style={styles.notificationSnippet} numberOfLines={2}>
                            {snippet}
                          </Text>
                        ) : null}
                      </View>
                      {isRequest ? (
                        <View style={styles.rowActions}>
                          <Button
                            label="Confirm"
                            size="sm"
                            loading={busy}
                            onPress={() => void respondInline(item, "accept")}
                          />
                          <Button
                            label="Delete"
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onPress={() => void respondInline(item, "reject")}
                          />
                        </View>
                      ) : canMessage ? (
                        <Button
                          label="Message"
                          size="sm"
                          variant="secondary"
                          loading={busy}
                          onPress={() => void messageActor(item)}
                        />
                      ) : unread ? (
                        <View style={styles.unreadDot} />
                      ) : null}
                    </Pressable>
                  </SwipeableNotificationCard>
                );
              }}
            />
          )}
        </View>
      </View>

      {/* Bottom-anchored toast that lets the user undo a delete. Absolutely
       * positioned so it floats above the notifications list without
       * shifting layout. */}
      <UndoToast
        visible={!!pendingUndo}
        message="Notification deleted"
        onUndo={handleUndoDelete}
        onHide={() => setPendingUndo(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    paddingHorizontal: 20,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 32,
    color: Colors.dark,
    marginBottom: 4,
  },
  markAllText: {
    color: Colors.primary,
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 13,
  },
  unreadText: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: Colors.primary,
    marginBottom: 16,
  },
  notificationsPane: {
    flex: 1,
  },
  notificationsSection: {
    flex: 1,
    paddingTop: 8,
  },
  ctaRow: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ctaAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ctaAvatarEmpty: {
    backgroundColor: "#E9EAEC",
  },
  ctaAvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  ctaCopy: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 16,
    fontFamily: Fonts.gabarito.semiBold,
    color: Colors.dark,
  },
  ctaSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.instrument.regular,
    color: "#777",
    marginTop: 1,
  },
  sectionHeader: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 17,
    color: Colors.dark,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  notificationsList: {
    flex: 1,
  },
  loader: {
    marginTop: 28,
  },
  listContent: {
    paddingBottom: 28,
  },
  stateCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginTop: 12,
    padding: 16,
  },
  emptyTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginBottom: 6,
  },
  emptyText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  notificationRow: {
    backgroundColor: Colors.light,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarText: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 18,
    color: "#fff",
  },
  notificationBody: {
    flex: 1,
    gap: 3,
  },
  notificationLine: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.dark,
  },
  notificationName: {
    fontFamily: Fonts.instrument.semiBold,
  },
  notificationAge: {
    color: "#8A8F95",
  },
  notificationSnippet: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
    lineHeight: 19,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
});
