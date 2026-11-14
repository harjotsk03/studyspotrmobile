import {
  Alert,
  Animated,
  PanResponder,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowLeft, Search, UserPlus } from "lucide-react-native";
import { SkeletonList, SkeletonRow } from "../components/Skeleton";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
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

type SentUser = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo?: string | null;
};

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
  const route = useRoute();
  const { token } = useAuth();
  const [tab, setTab] = useState<"received" | "sent">(
    (route.params as { tab?: "received" | "sent" } | undefined)?.tab ===
      "sent"
      ? "sent"
      : "received",
  );
  // Reflect a tab passed when arriving from elsewhere (e.g. the friends list).
  const paramTab = (route.params as { tab?: "received" | "sent" } | undefined)
    ?.tab;
  useEffect(() => {
    if (paramTab) setTab(paramTab);
  }, [paramTab]);

  const [query, setQuery] = useState("");
  const [pageW, setPageW] = useState(0);
  const [tabsW, setTabsW] = useState(0);
  const tabAnim = useRef(new Animated.Value(tab === "sent" ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(tabAnim, {
      toValue: tab === "sent" ? 1 : 0,
      friction: 9,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [tab, tabAnim]);
  const q = query.trim().toLowerCase();

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const pageWRef = useRef(0);
  pageWRef.current = pageW;
  const settle = (target: 0 | 1) => {
    Animated.spring(tabAnim, {
      toValue: target,
      friction: 9,
      tension: 90,
      useNativeDriver: true,
    }).start();
    setTab(target === 1 ? "sent" : "received");
  };
  /** Drag the pages with the finger and snap to the nearer tab on release. */
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (e, g) => {
        const startX = e.nativeEvent.pageX - g.dx;
        return (
          startX > 20 &&
          Math.abs(g.dx) > 12 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.5 &&
          // Only the direction that leads to the other tab.
          (tabRef.current === "received" ? g.dx < 0 : g.dx > 0)
        );
      },
      onPanResponderGrant: () => tabAnim.stopAnimation(),
      onPanResponderMove: (_, g) => {
        const base = tabRef.current === "sent" ? 1 : 0;
        const w = pageWRef.current || 1;
        tabAnim.setValue(Math.min(1, Math.max(0, base - g.dx / w)));
      },
      onPanResponderRelease: (_, g) => {
        const base = tabRef.current === "sent" ? 1 : 0;
        const w = pageWRef.current || 1;
        const v = Math.min(1, Math.max(0, base - g.dx / w));
        const flick = -g.vx;
        const next = flick > 0.5 ? 1 : flick < -0.5 ? 0 : v > 0.5 ? 1 : 0;
        settle(next as 0 | 1);
      },
      onPanResponderTerminate: () =>
        settle(tabRef.current === "sent" ? 1 : 0),
    }),
  ).current;

  const [sent, setSent] = useState<SentUser[]>([]);
  const [sentLoading, setSentLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const loadSent = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/friends/outgoing`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const json = await res.json().catch(() => null);
      if (res.ok) setSent(Array.isArray(json?.users) ? json.users : []);
    } catch {
      // Keep the previous list; pull to refresh retries.
    } finally {
      setSentLoading(false);
    }
  }, [token]);

  // Refetch every time the screen comes into focus so a request sent from a
  // profile shows up without needing a manual refresh.
  useFocusEffect(
    useCallback(() => {
      void loadSent();
    }, [loadSent]),
  );

  const cancelSent = async (user: SentUser) => {
    if (!token) return;
    setCancelingId(user.id);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/users/friends/${encodeURIComponent(user.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          typeof json?.error === "string" ? json.error : "Could not cancel.",
        );
      }
      setSent((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not cancel request.",
      );
    } finally {
      setCancelingId(null);
    }
  };

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
  const matches = (
    u: { first_name?: string | null; last_name?: string | null; username?: string | null } | null | undefined,
  ) => {
    if (!q) return true;
    const name = [u?.first_name, u?.last_name].filter(Boolean).join(" ").toLowerCase();
    return name.includes(q) || (u?.username ?? "").toLowerCase().includes(q);
  };
  const shownRequests = friendRequests.filter((n) => matches(n.actor));
  const shownSent = sent.filter((u) => matches(u));
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

      <View
        style={styles.tabs}
        onLayout={(e) => setTabsW(e.nativeEvent.layout.width)}
      >
        {tabsW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabIndicator,
              {
                width: (tabsW - 6) / 2,
                transform: [
                  {
                    translateX: tabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, (tabsW - 6) / 2],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {(["received", "sent"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            activeOpacity={0.8}
            onPress={() => setTab(t)}
            style={styles.tab}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "received"
                ? `Received${friendRequests.length ? ` (${friendRequests.length})` : ""}`
                : `Sent${sent.length ? ` (${sent.length})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color="#8C8C8C" strokeWidth={2.2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tab === "sent" ? "Search sent requests" : "Search requests"}
          placeholderTextColor="#8C8C8C"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      <View
        style={styles.pagerClip}
        {...swipe.panHandlers}
        onLayout={(e) => setPageW(e.nativeEvent.layout.width)}
      >
        {pageW > 0 ? (
          <Animated.View
            style={[
              styles.pager,
              {
                width: pageW * 2,
                transform: [
                  {
                    translateX: tabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -pageW],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={{ width: pageW }}>
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
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          data={shownRequests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            shownRequests.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refreshNotifications()}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyCenter}>
              <UserPlus size={44} color="#C5C9CE" strokeWidth={1.6} />
              <Text style={styles.emptyCenterTitle}>{q ? "No matches" : "No follow requests"}</Text>
              <Text style={styles.emptyCenterBody}>
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
            <View style={{ width: pageW }}>
        {sentLoading ? (
          <SkeletonList
            count={4}
            style={styles.listContent}
            row={<SkeletonRow avatarSize={48} lines={2} actions />}
          />
        ) : (
          <FlatList
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            data={shownSent}
            keyExtractor={(u) => u.id}
            contentContainerStyle={[
              styles.listContent,
              shownSent.length === 0 && styles.listContentEmpty,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={false}
                onRefresh={() => void loadSent()}
                tintColor={Colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyCenter}>
                <UserPlus size={44} color="#C5C9CE" strokeWidth={1.6} />
                <Text style={styles.emptyCenterTitle}>{q ? "No matches" : "No sent requests"}</Text>
                <Text style={styles.emptyCenterBody}>
                  People you've requested to follow will show up here until
                  they accept.
                </Text>
              </View>
            }
            renderItem={({ item: u }) => {
              const name =
                [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
                u.username ||
                "StudySpotr user";
              const uri =
                typeof u.profile_photo === "string" && u.profile_photo.trim()
                  ? encodeURI(u.profile_photo.trim())
                  : "";
              const avatarUser = {
                id: u.id,
                first_name: u.first_name ?? undefined,
                last_name: u.last_name ?? undefined,
                username: u.username ?? undefined,
                name,
              };
              const canceling = cancelingId === u.id;
              return (
                <View style={styles.requestCard}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() =>
                      rootNavigation.navigate("PublicProfile", { userId: u.id })
                    }
                    style={styles.requestIdentity}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.avatar} />
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
                      <Text style={styles.requestTitle} numberOfLines={1}>
                        {name}
                      </Text>
                      {u.username ? (
                        <Text style={styles.username} numberOfLines={1}>
                          @{u.username} · Requested
                        </Text>
                      ) : (
                        <Text style={styles.username}>Requested</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    accessibilityLabel={`Cancel follow request to ${name}`}
                    disabled={canceling}
                    onPress={() => void cancelSent(u)}
                    style={[
                      styles.actionButton,
                      styles.declineButton,
                      canceling && styles.disabledButton,
                    ]}
                  >
                    <Text style={[styles.actionButtonText, styles.declineText]}>
                      {canceling ? "Canceling…" : "Cancel"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
            </View>
          </Animated.View>
        ) : null}
      </View>
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
    backgroundColor: "transparent",
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
  listContentEmpty: {
    flexGrow: 1,
    paddingBottom: 0,
    gap: 0,
  },
  emptyCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingBottom: 72,
  },
  emptyCenterTitle: {
    marginTop: 14,
    color: Colors.dark,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    textAlign: "center",
  },
  emptyCenterBody: {
    marginTop: 6,
    maxWidth: 220,
    color: "#8A8F96",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
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
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 3,
    borderRadius: 12,
    backgroundColor: "#E9EAEC",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabIndicator: {
    position: "absolute",
    top: 3,
    left: 3,
    bottom: 3,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    paddingVertical: 0,
  },
  pagerClip: {
    flex: 1,
    overflow: "hidden",
  },
  pager: {
    flex: 1,
    flexDirection: "row",
  },
  tabText: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 13,
    color: "#777",
  },
  tabTextActive: {
    color: Colors.dark,
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
