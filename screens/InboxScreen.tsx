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
import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

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

  return "You have a new update.";
}

function formatNotificationTypeLabel(type?: string | null) {
  if (type === "community_join_request") return "Community request";
  if (type === "accepted_to_community") return "Community";
  return "";
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
  const {
    notifications,
    unreadCount,
    loading,
    refreshing,
    error,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    restoreNotification,
  } = useNotifications();

  /**
   * Holds the most recently deleted notification so the undo toast can
   * restore it. Single-slot by design: a new delete replaces this entry,
   * which means once a toast disappears (or is replaced), the previous
   * deletion becomes permanent — matching Gmail / Mail's behavior.
   */
  const [pendingUndo, setPendingUndo] = useState<NotificationItem | null>(null);

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
    }
  };
  const friendRequests = notifications.filter(
    (notification) => notification.type === "friend_request",
  );
  const visibleNotifications = notifications.filter(
    (notification) => notification.type !== "friend_request",
  );
  const unreadVisibleNotificationIds = visibleNotifications
    .filter((notification) => !notification.read_at)
    .map((notification) => notification.id)
    .join(",");

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
          {unreadCount > 0 && (
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
        {unreadCount > 0 && (
          <Text style={styles.unreadText}>
            {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
          </Text>
        )}
      </View>

      <View style={styles.notificationsPane}>
        <View style={styles.ctaRow}>
          <View style={styles.ctaCopy}>
            <Text style={styles.ctaTitle}>Follow requests</Text>
            <Text style={styles.ctaSubtitle}>
              {formatFollowRequestSummary(friendRequests)}
            </Text>
          </View>
          <Button
            label="Review"
            variant="accent"
            size="sm"
            onPress={() => navigation.navigate("FriendRequests")}
          />
        </View>

        <View style={styles.ctaRow}>
          <View style={styles.ctaCopy}>
            <Text style={styles.ctaTitle}>Messages</Text>
            <Text style={styles.ctaSubtitle}>
              Jump to your direct messages inbox.
            </Text>
          </View>
          <Button
            label="Open"
            variant="default"
            size="sm"
            onPress={() => navigation.navigate("Messages")}
          />
        </View>

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
              data={visibleNotifications}
              keyExtractor={(item) => item.id}
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
                    Community invites, requests, and updates will show up here.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const unread = !item.read_at;
                const actorName = formatActorName(item.actor);
                const typeLabel = formatNotificationTypeLabel(item.type);
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
                      style={[
                        styles.notificationCard,
                        unread && styles.unreadNotificationCard,
                      ]}
                      onPress={() => handleNotificationPress(item)}
                    >
                      <Pressable
                        disabled={!item.actor?.id}
                        onPress={() =>
                          item.actor?.id
                            ? rootNavigation.navigate("PublicProfile", {
                                userId: item.actor.id,
                              })
                            : undefined
                        }
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
                        {!!typeLabel && (
                          <Text style={styles.typeLabel}>{typeLabel}</Text>
                        )}
                        <View style={styles.notificationHeader}>
                          <Text
                            style={styles.notificationTitle}
                            numberOfLines={1}
                          >
                            {formatNotificationTitle(item)}
                          </Text>
                          {unread && <View style={styles.unreadDot} />}
                        </View>
                        <Text
                          style={styles.notificationMessage}
                          numberOfLines={2}
                        >
                          {formatNotificationBody(item)}
                        </Text>
                      </View>
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
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  ctaCopy: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 18,
    fontFamily: Fonts.gabarito.medium,
    color: Colors.dark,
    marginBottom: 2,
  },
  ctaSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.instrument.regular,
    color: Colors.dark,
    lineHeight: 16,
  },
  notificationsList: {
    flex: 1,
  },
  loader: {
    marginTop: 28,
  },
  listContent: {
    paddingBottom: 28,
    gap: 6,
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
  notificationCard: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.05)",
  },
  unreadNotificationCard: {
    backgroundColor: "#F8FBFF",
    borderColor: "rgba(26, 97, 168, 0.18)",
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarText: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 17,
    color: "#fff",
  },
  notificationBody: {
    flex: 1,
    gap: 4,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeLabel: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 153, 0, 0.14)",
    borderRadius: 999,
    color: Colors.accent,
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  notificationTitle: {
    flex: 1,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  notificationMessage: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#555",
    lineHeight: 19,
  },
});
