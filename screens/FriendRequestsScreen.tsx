import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowLeft } from "lucide-react-native";
import { SkeletonList, SkeletonRow } from "../components/Skeleton";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import {
  useNotifications,
  type NotificationActor,
  type NotificationItem,
} from "../context/NotificationsContext";
import type { InboxStackParamList } from "../types/navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import type { RootStackParamList } from "../types/navigation";

function formatActorName(actor?: NotificationActor | null) {
  if (!actor) return "Someone";

  const fullName = [actor.first_name, actor.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || actor.username || "Someone";
}

export default function FriendRequestsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const {
    notifications,
    loading,
    refreshing,
    error,
    refreshNotifications,
    markNotificationRead,
    respondToFriendRequest,
  } = useNotifications();
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const friendRequests = notifications.filter(
    (notification) => notification.type === "friend_request",
  );
  const unreadFriendRequestIds = friendRequests
    .filter((notification) => !notification.read_at)
    .map((notification) => notification.id);
  const unreadFriendRequestIdsKey = unreadFriendRequestIds.join(",");

  useEffect(() => {
    if (unreadFriendRequestIds.length === 0) return;

    void Promise.all(
      unreadFriendRequestIds.map((notificationId) =>
        markNotificationRead(notificationId),
      ),
    ).catch(() => {
      // The next poll keeps this screen in sync if marking read fails.
    });
  }, [markNotificationRead, unreadFriendRequestIdsKey]);

  async function handleRespond(
    notification: NotificationItem,
    decision: "accept" | "reject",
  ) {
    const friendId = notification.actor?.id ?? notification.actor_user_id;

    if (!friendId) {
      Alert.alert("Error", "Missing user ID for this request.");
      return;
    }

    setRespondingId(friendId);

    try {
      await respondToFriendRequest(friendId, decision);
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not respond to request.",
      );
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Follow requests</Text>
        </View>
        <View style={[styles.iconButton, styles.hiddenIconButton]} />
      </View>

      {loading && (
        <SkeletonList
          count={5}
          style={styles.listContent}
          row={<SkeletonRow avatarSize={48} lines={2} actions />}
        />
      )}

      {!loading && !!error && (
        <View style={styles.stateCard}>
          <Text style={styles.emptyTitle}>Could not load requests</Text>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={friendRequests}
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
              <Text style={styles.emptyTitle}>No follow requests</Text>
              <Text style={styles.emptyText}>
                New follow requests will show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const actorName = formatActorName(item.actor);
            const friendId = item.actor?.id ?? item.actor_user_id ?? item.id;
            const isResponding = respondingId === friendId;
            const avatarUri =
              typeof item.actor?.profile_photo === "string" &&
              item.actor.profile_photo.trim().length > 0
                ? encodeURI(item.actor.profile_photo.trim())
                : "";
            const avatarUser = {
              id: item.actor?.id,
              first_name: item.actor?.first_name ?? undefined,
              last_name: item.actor?.last_name ?? undefined,
              username: item.actor?.username ?? undefined,
              name: actorName,
            };

            return (
              <View style={styles.requestCard}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  disabled={!item.actor?.id}
                  onPress={() =>
                    item.actor?.id
                      ? rootNavigation.navigate("PublicProfile", {
                          userId: item.actor.id,
                        })
                      : undefined
                  }
                  style={styles.requestIdentity}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatar} />
                  ) : (
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: getUserAvatarColor(avatarUser) },
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {getUserInitials(avatarUser)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.requestBody}>
                    <Text style={styles.requestTitle}>{actorName}</Text>
                    {!!item.actor?.username && (
                      <Text style={styles.username}>
                        @{item.actor.username}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    accessibilityLabel={`Decline ${actorName}'s follow request`}
                    disabled={isResponding}
                    onPress={() => void handleRespond(item, "reject")}
                    style={[
                      styles.actionButton,
                      styles.declineButton,
                      isResponding && styles.disabledButton,
                    ]}
                  >
                    <Text style={[styles.actionButtonText, styles.declineText]}>
                      Decline
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    accessibilityLabel={`Accept ${actorName}'s follow request`}
                    disabled={isResponding}
                    onPress={() => void handleRespond(item, "accept")}
                    style={[
                      styles.actionButton,
                      styles.acceptButton,
                      isResponding && styles.disabledButton,
                    ]}
                  >
                    <Text style={[styles.actionButtonText, styles.acceptText]}>
                      Accept
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  hiddenIconButton: {
    backgroundColor: Colors.light,
  },
  headerCopy: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 12,
  },
  title: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 21,
  },
  loader: {
    marginTop: 28,
  },
  listContent: {
    gap: 12,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  stateCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 20,
  },
  emptyTitle: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    marginBottom: 6,
  },
  emptyText: {
    color: "#666",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  requestCard: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  requestIdentity: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: Colors.primary,
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 18,
  },
  requestBody: {
    flex: 1,
  },
  requestTitle: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
  },
  username: {
    color: "#777",
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
    marginTop: 1,
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 10,
    height: 30,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  declineButton: {
    backgroundColor: "#F1F1F1",
  },
  acceptButton: {
    backgroundColor: Colors.primary,
  },
  disabledButton: {
    opacity: 0.55,
  },
  actionButtonText: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 12,
  },
  declineText: {
    color: "#666",
  },
  acceptText: {
    color: "#fff",
  },
});
