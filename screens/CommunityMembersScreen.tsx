import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
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
import { ArrowLeft, Check, Search, Users, X } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import type { CommunityStackParamList } from "./CommunityDetailScreen";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

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
  onRespond,
  respondingId,
}: {
  item: Member;
  isAdmin: boolean;
  onRespond?: (userId: string, decision: "accept" | "reject") => void;
  respondingId?: string | null;
}) {
  const name = displayName(item.user);
  const isPending = item.status === "pending";
  const isResponding = respondingId === item.user.id;

  return (
    <View style={rowStyles.container}>
      <View
        style={[
          rowStyles.avatar,
          { backgroundColor: getUserAvatarColor({ ...item.user, name }) },
          isPending && rowStyles.avatarPending,
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
        <RoleBadge role={item.role} />
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
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarPending: {
    opacity: 0.6,
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
});

// ─── Separator ────────────────────────────────────────────────────────────────

function Separator() {
  return (
    <View style={{ height: 1, backgroundColor: "#F4F4F4", marginLeft: 80 }} />
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunityMembersScreen({ route }: Props) {
  const { communityId, communityName, isAdmin } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [respondingId, setRespondingId] = useState<string | null>(null);

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
      if (res.ok) {
        if (decision === "accept") {
          setMembers((prev) =>
            prev.map((m) =>
              m.user.id === userId ? { ...m, status: "accepted" as const } : m,
            ),
          );
        } else {
          setMembers((prev) => prev.filter((m) => m.user.id !== userId));
        }
      } else {
        const json = await res.json();
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
        <ActivityIndicator
          size="large"
          color={Colors.primary}
          style={styles.loader}
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
              onRespond={section.isPending ? handleRespond : undefined}
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
