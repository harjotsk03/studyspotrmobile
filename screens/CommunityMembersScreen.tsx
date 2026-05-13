import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import {
  ArrowLeft,
  Check,
  MoreVertical,
  Search,
  Shield,
  ShieldOff,
  UserMinus,
  Users,
  X,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import { SkeletonList, SkeletonRow } from "../components/Skeleton";
import type { CommunityStackParamList } from "./CommunityDetailScreen";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import type { RootStackParamList } from "../types/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  joined_at: string | null;
}

type Props = NativeStackScreenProps<CommunityStackParamList, "CommunityMembers">;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_PRIORITY: Record<string, number> = { owner: 0, admin: 1, member: 2 };

function sortAccepted(members: Member[]): Member[] {
  return [...members].sort((a, b) => {
    const pa = ROLE_PRIORITY[a.role ?? ""] ?? 3;
    const pb = ROLE_PRIORITY[b.role ?? ""] ?? 3;
    return pa - pb;
  });
}

function formatJoinDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `Joined ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatRequestDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `Requested ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function displayName(user: MemberUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return full || user.username || "Unknown";
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string | null }) {
  if (!role || role === "member") return null;
  const isOwner = role === "owner";
  return (
    <View
      style={[
        badgeStyles.badge,
        isOwner ? badgeStyles.ownerBg : badgeStyles.adminBg,
      ]}
    >
      <Text
        style={[
          badgeStyles.text,
          isOwner ? badgeStyles.ownerText : badgeStyles.adminText,
        ]}
      >
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ownerBg: { backgroundColor: "#FEF3C7" },
  adminBg: { backgroundColor: Colors.primary + "18" },
  text: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  ownerText: { color: "#92400E" },
  adminText: { color: Colors.primary },
});

// ─── Member Row ───────────────────────────────────────────────────────────────

const AVATAR_SIZE = 46;

function MemberRow({
  item,
  isAdmin,
  isSelf,
  isHighlighted,
  onRespond,
  onMore,
  respondingId,
}: {
  item: Member;
  isAdmin: boolean;
  isSelf: boolean;
  isHighlighted: boolean;
  onRespond?: (userId: string, decision: "accept" | "reject") => void;
  onMore?: (member: Member) => void;
  respondingId?: string | null;
}) {
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const name = displayName(item.user);
  const isPending = item.status === "pending";
  const isResponding = respondingId === item.user.id;
  const isOwner = item.role === "owner";
  const canManage = isAdmin && !isSelf && !isPending && !isOwner;

  return (
    <View
      style={[
        rowStyles.container,
        isHighlighted && rowStyles.containerHighlighted,
      ]}
    >
      <Pressable
        style={rowStyles.identity}
        disabled={isSelf}
        onPress={() =>
          rootNavigation.navigate("PublicProfile", { userId: item.user.id })
        }
      >
        <View
          style={[
            rowStyles.avatar,
            { backgroundColor: getUserAvatarColor({ ...item.user, name }) },
          ]}
        >
          {item.user.profile_photo ? (
            <Image
              source={{ uri: item.user.profile_photo }}
              style={rowStyles.avatarImg}
            />
          ) : (
            <Text style={rowStyles.avatarInitial}>
              {getUserInitials({ ...item.user, name })}
            </Text>
          )}
        </View>

        <View style={rowStyles.info}>
          <Text style={rowStyles.name} numberOfLines={1}>
            {name}
          </Text>
          {!!item.user.username && (
            <Text style={rowStyles.username} numberOfLines={1}>
              @{item.user.username}
            </Text>
          )}
          {!isPending && (
            <Text style={rowStyles.joinDate}>
              {formatJoinDate(item.joined_at)}
            </Text>
          )}
        </View>
      </Pressable>

      {isPending && isAdmin ? (
        isResponding ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <View style={rowStyles.respondRow}>
            <Pressable
              style={rowStyles.acceptBtn}
              onPress={() => onRespond?.(item.user.id, "accept")}
            >
              <Check size={14} color="#16A34A" strokeWidth={2.5} />
              <Text style={rowStyles.acceptText}>Accept</Text>
            </Pressable>
            <Pressable
              style={rowStyles.rejectBtn}
              onPress={() => onRespond?.(item.user.id, "reject")}
            >
              <X size={14} color="#DC2626" strokeWidth={2.5} />
              <Text style={rowStyles.rejectText}>Decline</Text>
            </Pressable>
          </View>
        )
      ) : !isPending ? (
        <View style={rowStyles.trailing}>
          <RoleBadge role={item.role} />
          {canManage && (
            <Pressable
              hitSlop={8}
              onPress={() => onMore?.(item)}
              style={rowStyles.moreBtn}
              accessibilityLabel="Member actions"
              accessibilityRole="button"
            >
              <MoreVertical size={18} color="#888" strokeWidth={2.2} />
            </Pressable>
          )}
        </View>
      ) : (
        <View style={rowStyles.pendingBadge}>
          <Text style={rowStyles.pendingBadgeText}>Pending</Text>
        </View>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#fff",
    gap: 14,
  },
  containerHighlighted: {
    backgroundColor: "#FFF7E6",
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingLeft: 17,
  },
  identity: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 14,
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
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 19,
    color: "#fff",
  },
  info: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  username: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
  joinDate: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#BBB",
    marginTop: 2,
  },
  respondRow: {
    flexDirection: "row",
    gap: 6,
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  acceptText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    color: "#16A34A",
  },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rejectText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    color: "#DC2626",
  },
  pendingBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pendingBadgeText: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    color: "#92400E",
    letterSpacing: 0.3,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── Separator ────────────────────────────────────────────────────────────────

function Separator() {
  return (
    <View style={{ height: 1, backgroundColor: "#F4F4F4", marginLeft: 80 }} />
  );
}

// ─── Member Actions Modal ─────────────────────────────────────────────────────

const SCREEN_HEIGHT = Dimensions.get("window").height;

function MemberActionsModal({
  member,
  onClose,
  onPromote,
  onDemote,
  onRemove,
  loading,
}: {
  member: Member | null;
  onClose: () => void;
  onPromote: () => void;
  onDemote: () => void;
  onRemove: () => void;
  loading: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const [renderedMember, setRenderedMember] = useState<Member | null>(null);

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (member) {
      setRenderedMember(member);
      setMounted(true);
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 320,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          setRenderedMember(null);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);

  if (!mounted) return null;

  const isAdminMember = renderedMember?.role === "admin";
  const name = renderedMember ? displayName(renderedMember.user) : "";

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={loading ? undefined : onClose}
    >
      <View style={modalStyles.root}>
        <Animated.View
          pointerEvents="none"
          style={[modalStyles.backdrop, { opacity: backdropOpacity }]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={loading ? undefined : onClose}
        />
        <Animated.View
          style={[
            modalStyles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            { transform: [{ translateY }] },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={modalStyles.handle} />

          <View style={modalStyles.header}>
            <Text style={modalStyles.title} numberOfLines={1}>
              {name}
            </Text>
            <Text style={modalStyles.subtitle}>
              {isAdminMember ? "Admin" : "Member"}
            </Text>
          </View>

          <Pressable
            disabled={loading}
            style={({ pressed }) => [
              modalStyles.action,
              pressed && modalStyles.actionPressed,
            ]}
            onPress={isAdminMember ? onDemote : onPromote}
          >
            {isAdminMember ? (
              <ShieldOff size={20} color={Colors.dark} strokeWidth={2} />
            ) : (
              <Shield size={20} color={Colors.dark} strokeWidth={2} />
            )}
            <Text style={modalStyles.actionText}>
              {isAdminMember ? "Demote to Member" : "Promote to Admin"}
            </Text>
          </Pressable>

          <View style={modalStyles.divider} />

          <Pressable
            disabled={loading}
            style={({ pressed }) => [
              modalStyles.action,
              pressed && modalStyles.actionPressed,
            ]}
            onPress={onRemove}
          >
            <UserMinus size={20} color="#DC2626" strokeWidth={2} />
            <Text style={[modalStyles.actionText, modalStyles.dangerText]}>
              Remove from Community
            </Text>
          </Pressable>

          <Pressable
            disabled={loading}
            style={({ pressed }) => [
              modalStyles.cancelBtn,
              pressed && modalStyles.actionPressed,
            ]}
            onPress={onClose}
          >
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </Pressable>

          {loading && (
            <View style={modalStyles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    marginBottom: 4,
  },
  title: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  subtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 12,
  },
  actionPressed: {
    backgroundColor: "#F5F5F5",
  },
  actionText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 16,
    color: Colors.dark,
  },
  dangerText: {
    color: "#DC2626",
  },
  divider: {
    height: 1,
    backgroundColor: "#F4F4F4",
    marginHorizontal: 12,
  },
  cancelBtn: {
    marginTop: 6,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
  },
  cancelText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunityMembersScreen({ route }: Props) {
  const { communityId, communityName, isAdmin, highlightUserId } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token, profile } = useAuth();
  const currentUserId = profile?.userProfile?.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [actionMember, setActionMember] = useState<Member | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Search bar focus animation
  const borderColor = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  const borderAnim = borderColor.interpolate({
    inputRange: [0, 1],
    outputRange: ["#E6E6E6", Colors.primary],
  });

  function onFocus() {
    Animated.timing(borderColor, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }

  function onBlur() {
    Animated.timing(borderColor, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

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

  async function handleRoleChange(userId: string, role: "admin" | "member") {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/members/${userId}/role`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ role }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        Alert.alert("Error", json?.error ?? "Could not update role.");
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.user.id === userId ? { ...m, role } : m)),
      );
      setActionMember(null);
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/members/${userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        Alert.alert("Error", json?.error ?? "Could not remove member.");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.user.id !== userId));
      setActionMember(null);
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  function confirmRemove(member: Member) {
    const name = displayName(member.user);
    Alert.alert(
      "Remove member?",
      `Are you sure you want to remove ${name} from this community?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => handleRemoveMember(member.user.id),
        },
      ],
    );
  }

  async function handleRespond(userId: string, decision: "accept" | "reject") {
    if (!token) return;
    setRespondingId(userId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/members/respond`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ user_id: userId, decision }),
        },
      );
      const json = await res.json().catch(() => null);
      if (res.ok) {
        if (decision === "accept") {
          const acceptedAt =
            json?.membership?.joined_at ??
            json?.joined_at ??
            new Date().toISOString();
          const acceptedRole = json?.membership?.role ?? json?.role ?? "member";
          setMembers((prev) =>
            prev.map((m) =>
              m.user.id === userId
                ? {
                    ...m,
                    status: "accepted" as const,
                    joined_at: m.joined_at ?? acceptedAt,
                    role: m.role ?? acceptedRole,
                  }
                : m,
            ),
          );
        } else {
          setMembers((prev) => prev.filter((m) => m.user.id !== userId));
        }
      } else {
        Alert.alert("Error", json?.error ?? "Could not process the request.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setRespondingId(null);
    }
  }

  // ── Split and filter lists ─────────────────────────────────────────────────

  const { pending, accepted } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesQuery = (m: Member) => {
      if (!q) return true;
      const name = displayName(m.user).toLowerCase();
      const username = (m.user.username ?? "").toLowerCase();
      return name.includes(q) || username.includes(q);
    };
    return {
      pending: members.filter((m) => m.status === "pending" && matchesQuery(m)),
      accepted: sortAccepted(
        members.filter((m) => m.status === "accepted" && matchesQuery(m)),
      ),
    };
  }, [members, query]);

  const acceptedCount = members.filter((m) => m.status === "accepted").length;
  const pendingCount = members.filter((m) => m.status === "pending").length;

  // ── Render ────────────────────────────────────────────────────────────────

  // Build sections for SectionList: pending (admin only) + accepted
  type SectionData = { title: string; data: Member[]; isPending: boolean };
  const sections: SectionData[] = [];
  if (isAdmin && pending.length > 0) {
    sections.push({
      title: "Pending Requests",
      data: pending,
      isPending: true,
    });
  }
  sections.push({ title: "Members", data: accepted, isPending: false });

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Members</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {communityName}
          </Text>
        </View>

        <View style={[styles.iconButton, { opacity: 0 }]} />
      </View>

      {/* Search bar */}
      <View style={styles.searchWrapper}>
        <Animated.View style={[styles.searchBar, { borderColor: borderAnim }]}>
          <Search size={16} color="#AAA" strokeWidth={2.2} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search members…"
            placeholderTextColor="#BBB"
            value={query}
            onChangeText={setQuery}
            onFocus={onFocus}
            onBlur={onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              hitSlop={8}
            >
              <X size={15} color="#AAA" strokeWidth={2.5} />
            </Pressable>
          )}
        </Animated.View>
      </View>

      {/* Content */}
      {loading ? (
        <SkeletonList
          count={7}
          style={styles.memberSkeletonList}
          row={<SkeletonRow avatarSize={AVATAR_SIZE} lines={3} actions />}
        />
      ) : error ? (
        <View style={styles.centeredBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => fetchMembers()}
            style={styles.retryBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.user.id}
          renderItem={({ item, section }) => (
            <MemberRow
              item={item}
              isAdmin={isAdmin}
              isSelf={item.user.id === currentUserId}
              isHighlighted={
                !!highlightUserId && item.user.id === highlightUserId
              }
              onRespond={section.isPending ? handleRespond : undefined}
              onMore={section.isPending ? undefined : setActionMember}
              respondingId={respondingId}
            />
          )}
          ItemSeparatorComponent={Separator}
          SectionSeparatorComponent={() => (
            <View style={{ height: 8, backgroundColor: Colors.light }} />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>
                {section.isPending
                  ? `${pendingCount} pending ${pendingCount === 1 ? "request" : "requests"}`
                  : query
                    ? `${accepted.length} of ${acceptedCount.toLocaleString()} ${acceptedCount === 1 ? "member" : "members"}`
                    : `${acceptedCount.toLocaleString()} ${acceptedCount === 1 ? "member" : "members"}`}
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchMembers(true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            accepted.length === 0 && (!isAdmin || pending.length === 0) ? (
              <View style={styles.centeredBox}>
                <Users size={44} color="#CCC" strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>
                  {query ? "No results" : "No members yet"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {query
                    ? `Nobody matched "${query}"`
                    : "This community has no members yet."}
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      <MemberActionsModal
        member={actionMember}
        loading={actionLoading}
        onClose={() => setActionMember(null)}
        onPromote={() =>
          actionMember && handleRoleChange(actionMember.user.id, "admin")
        }
        onDemote={() =>
          actionMember && handleRoleChange(actionMember.user.id, "member")
        }
        onRemove={() => actionMember && confirmRemove(actionMember)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  searchWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    padding: 0,
  },
  loader: {
    marginTop: 60,
  },
  memberSkeletonList: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light,
  },
  sectionHeaderText: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 12,
    color: "#AAA",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  centeredBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 10,
    paddingTop: 40,
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
  errorText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary + "14",
  },
  retryText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.primary,
  },
});
