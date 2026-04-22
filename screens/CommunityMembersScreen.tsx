import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
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
import { ArrowLeft, Search, Users, X } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import type { CommunityStackParamList } from "./CommunityDetailScreen";

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
  joined_at: string | null;
}

type Props = NativeStackScreenProps<CommunityStackParamList, "CommunityMembers">;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_PRIORITY: Record<string, number> = { owner: 0, admin: 1, member: 2 };

function sortMembers(members: Member[]): Member[] {
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

function MemberRow({ item }: { item: Member }) {
  const name = displayName(item.user);
  const initial = name.charAt(0).toUpperCase();

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.avatar}>
        {item.user.profile_photo ? (
          <Image
            source={{ uri: item.user.profile_photo }}
            style={rowStyles.avatarImg}
          />
        ) : (
          <Text style={rowStyles.avatarInitial}>{initial}</Text>
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
        {!!item.joined_at && (
          <Text style={rowStyles.joinDate}>{formatJoinDate(item.joined_at)}</Text>
        )}
      </View>

      <RoleBadge role={item.role} />
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
    backgroundColor: Colors.primary + "1A",
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
    color: Colors.primary,
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
});

// ─── Separator ────────────────────────────────────────────────────────────────

function Separator() {
  return (
    <View style={{ height: 1, backgroundColor: "#F4F4F4", marginLeft: 80 }} />
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CommunityMembersScreen({ route }: Props) {
  const { communityId, communityName } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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
        setMembers(sortMembers(json.members ?? []));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load members.");
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

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = displayName(m.user).toLowerCase();
      const username = (m.user.username ?? "").toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [members, query]);

  // ── Render ────────────────────────────────────────────────────────────────

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

        {/* Placeholder to keep title centered */}
        <View style={[styles.iconButton, { opacity: 0 }]} />
      </View>

      {/* Search bar */}
      <View style={styles.searchWrapper}>
        <Animated.View
          style={[styles.searchBar, { borderColor: borderAnim }]}
        >
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
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.user.id}
          renderItem={({ item }) => <MemberRow item={item} />}
          ItemSeparatorComponent={Separator}
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
          ListHeaderComponent={
            members.length > 0 ? (
              <View style={styles.listHeader}>
                <Text style={styles.listHeaderText}>
                  {filtered.length === members.length
                    ? `${members.length.toLocaleString()} ${members.length === 1 ? "member" : "members"}`
                    : `${filtered.length} of ${members.length.toLocaleString()} members`}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
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
          }
          contentContainerStyle={
            filtered.length === 0 ? { flex: 1 } : { paddingBottom: 40 }
          }
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
  listHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light,
  },
  listHeaderText: {
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
