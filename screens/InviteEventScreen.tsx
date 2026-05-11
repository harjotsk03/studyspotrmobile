import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { ArrowLeft, Check, Send, UserCheck, Users } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import { SkeletonList, SkeletonRow } from "../components/Skeleton";
import type { CommunityStackParamList } from "./CommunityDetailScreen";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import type { RootStackParamList } from "../types/navigation";

interface MemberUser {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  profile_photo?: string;
}

interface Member {
  user: MemberUser;
  role: string | null;
  status: "pending" | "accepted";
}

type Props = NativeStackScreenProps<CommunityStackParamList, "InviteEvent">;

const AVATAR_SIZE = 46;

function displayName(user: MemberUser) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName || user.username || "Unknown";
}

function Avatar({ user }: { user: MemberUser }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const name = displayName(user);

  return (
    <Pressable
      onPress={() => navigation.navigate("PublicProfile", { userId: user.id })}
      style={[
        styles.avatar,
        { backgroundColor: getUserAvatarColor({ ...user, name }) },
      ]}
    >
      {user.profile_photo ? (
        <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitial}>
          {getUserInitials({ ...user, name })}
        </Text>
      )}
    </Pressable>
  );
}

function InviteRow({
  member,
  selected,
  onToggle,
}: {
  member: Member;
  selected: boolean;
  onToggle: () => void;
}) {
  const name = displayName(member.user);

  return (
    <Pressable style={styles.memberRow} onPress={onToggle}>
      <Avatar user={member.user} />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>
          {name}
        </Text>
        {!!member.user.username && (
          <Text style={styles.username} numberOfLines={1}>
            @{member.user.username}
          </Text>
        )}
      </View>
      <View style={[styles.invitePill, selected && styles.invitePillSelected]}>
        {selected && <Check size={13} color="#fff" strokeWidth={3} />}
        <Text style={[styles.inviteText, selected && styles.inviteTextSelected]}>
          {selected ? "Selected" : "Invite"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function InviteEventScreen({ route }: Props) {
  const { communityId, communityName, eventId, eventTitle } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token, profile } = useAuth();
  const currentUser = profile?.userProfile;

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [joinedSelf, setJoinedSelf] = useState(false);
  const [joiningSelf, setJoiningSelf] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const headerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [headerOpacity]);

  const acceptedMembers = useMemo(
    () => members.filter((member) => member.status === "accepted"),
    [members],
  );

  const selfMember = useMemo(() => {
    if (!currentUser?.id) return null;

    const fromMembers = acceptedMembers.find(
      (member) => member.user.id === currentUser.id,
    );

    if (fromMembers) return fromMembers;

    return {
      role: null,
      status: "accepted" as const,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        first_name: currentUser.first_name,
        last_name: currentUser.last_name,
        profile_photo: currentUser.profile_photo,
      },
    };
  }, [acceptedMembers, currentUser]);

  const inviteMembers = useMemo(
    () =>
      acceptedMembers.filter(
        (member) => member.user.id !== currentUser?.id,
      ),
    [acceptedMembers, currentUser?.id],
  );

  const allSelected =
    inviteMembers.length > 0 &&
    inviteMembers.every((member) => selectedIds.has(member.user.id));

  const fetchMembers = useCallback(
    async (isRefresh = false) => {
      if (!token) return;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/communities/${communityId}/members?limit=200`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setMembers(json.members ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load members.",
        );
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [communityId, token],
  );

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  function toggleMember(userId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (allSelected) return new Set();

      const next = new Set(current);
      inviteMembers.forEach((member) => next.add(member.user.id));
      return next;
    });
  }

  async function handleJoinSelf() {
    if (!token || joinedSelf) return;

    setJoiningSelf(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/events/${eventId}/join`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error ?? json?.message ?? "Could not join event.");
      }

      setJoinedSelf(true);
    } catch (err) {
      Alert.alert(
        "Could not join",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setJoiningSelf(false);
    }
  }

  async function handleSendInvites() {
    if (!token || selectedIds.size === 0) return;

    setSendingInvites(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/events/${eventId}/invite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ user_ids: Array.from(selectedIds) }),
        },
      );
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          json?.error ?? json?.message ?? "Could not send event invites.",
        );
      }

      Alert.alert(
        "Invites sent",
        `${selectedIds.size} ${selectedIds.size === 1 ? "member was" : "members were"} invited to this event.`,
        [{ text: "Done", onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      Alert.alert(
        "Invite failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSendingInvites(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Invite Members</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {communityName}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.skipButton}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.heroCard, { opacity: headerOpacity }]}>
        <Text style={styles.heroEyebrow}>Event created</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {eventTitle}
        </Text>
        <Text style={styles.heroBody}>
          Invite community members now, or skip and come back later.
        </Text>
      </Animated.View>

      {selfMember && (
        <View style={styles.selfCard}>
          <Avatar user={selfMember.user} />
          <View style={styles.memberInfo}>
            <Text style={styles.selfLabel}>You</Text>
            <Text style={styles.memberName} numberOfLines={1}>
              {displayName(selfMember.user)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.joinSelfButton, joinedSelf && styles.joinedSelfButton]}
            activeOpacity={0.75}
            onPress={() => void handleJoinSelf()}
            disabled={joiningSelf || joinedSelf}
          >
            {joiningSelf ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : joinedSelf ? (
              <>
                <UserCheck size={14} color="#16A34A" strokeWidth={2.5} />
                <Text style={styles.joinedSelfText}>Joined</Text>
              </>
            ) : (
              <Text style={styles.joinSelfText}>Join myself</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.listHeader}>
        <View>
          <Text style={styles.listTitle}>Community members</Text>
          <Text style={styles.listSubtitle}>
            {inviteMembers.length.toLocaleString()} available to invite
          </Text>
        </View>
        <Pressable
          style={[styles.selectAllButton, allSelected && styles.selectAllActive]}
          onPress={toggleSelectAll}
          disabled={inviteMembers.length === 0}
        >
          <Text
            style={[
              styles.selectAllText,
              allSelected && styles.selectAllActiveText,
            ]}
          >
            {allSelected ? "Clear all" : "Select all"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <SkeletonList
          count={7}
          style={styles.listContent}
          row={<SkeletonRow avatarSize={AVATAR_SIZE} lines={2} actions />}
        />
      ) : error ? (
        <View style={styles.centeredBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => fetchMembers()}
            style={styles.retryButton}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={inviteMembers}
          keyExtractor={(item) => item.user.id}
          renderItem={({ item }) => (
            <InviteRow
              member={item}
              selected={selectedIds.has(item.user.id)}
              onToggle={() => toggleMember(item.user.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centeredBox}>
              <Users size={44} color="#CCC" strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No one else to invite</Text>
              <Text style={styles.emptySubtitle}>
                You are the only accepted member in this community right now.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchMembers(true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Button
          label={
            selectedIds.size === 0
              ? "Select members to invite"
              : `Send ${selectedIds.size} ${selectedIds.size === 1 ? "Invite" : "Invites"}`
          }
          icon={<Send size={18} color="#fff" strokeWidth={2.3} />}
          fullWidth
          disabled={selectedIds.size === 0}
          loading={sendingInvites}
          onPress={() => void handleSendInvites()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 12,
  },
  headerTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  headerSubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 1,
  },
  skipButton: {
    minWidth: 40,
    alignItems: "flex-end",
    paddingVertical: 8,
  },
  skipText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.primary,
  },
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 16,
  },
  heroEyebrow: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    lineHeight: 27,
  },
  heroBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
    lineHeight: 20,
    marginTop: 8,
  },
  selfCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 19,
    color: "#fff",
  },
  memberInfo: {
    flex: 1,
    gap: 1,
  },
  selfLabel: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  memberName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  username: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
  joinSelfButton: {
    minWidth: 108,
    height: 38,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 5,
  },
  joinSelfText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: "#fff",
  },
  joinedSelfButton: {
    backgroundColor: "#DCFCE7",
  },
  joinedSelfText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: "#16A34A",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  listTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  listSubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  selectAllButton: {
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E6E6E6",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectAllActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectAllText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: Colors.dark,
  },
  selectAllActiveText: {
    color: "#fff",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  invitePill: {
    minWidth: 84,
    height: 34,
    borderRadius: 999,
    backgroundColor: Colors.light,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 5,
  },
  invitePillSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  inviteText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: Colors.dark,
  },
  inviteTextSelected: {
    color: "#fff",
  },
  separator: {
    height: 1,
    backgroundColor: "#F4F4F4",
    marginLeft: 80,
  },
  loader: {
    marginTop: 48,
  },
  centeredBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 72,
    gap: 10,
  },
  errorText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#fff",
  },
  emptyTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 110,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
});
