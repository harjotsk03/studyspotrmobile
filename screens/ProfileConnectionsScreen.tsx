import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  ChevronRight,
  Search,
  Users,
} from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { API_BASE_URL } from "../constants/Api";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import type { RootStackParamList } from "../types/navigation";
import type { CommunityData } from "./CommunityDetailScreen";

export type ProfileConnectionsKind = "friends" | "communities";

type ConnectionUser = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo?: string | null;
};

type ConnectionCommunity = {
  id: string;
  name?: string | null;
  description?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  is_public?: boolean;
  category?: string | null;
  created_by?: string | null;
  member_count?: number | null;
  user_role?: string | null;
  membership_status?: string | null;
  is_member?: boolean;
};

type Props = NativeStackScreenProps<RootStackParamList, "ProfileConnections">;

function displayName(user: ConnectionUser) {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || user.username || "StudySpotr user";
}

function toCommunityData(api: ConnectionCommunity): CommunityData {
  return {
    id: api.id,
    name: api.name?.trim() || "Community",
    description: api.description ?? "",
    members: api.member_count ?? 0,
    icon: api.avatar_url ?? undefined,
    avatar_url: api.avatar_url ?? undefined,
    banner_url: api.banner_url ?? undefined,
    color: Colors.primary,
    category: api.category ?? undefined,
    is_public: api.is_public,
    created_by: api.created_by ?? undefined,
    user_role: api.user_role ?? undefined,
    user_membership_status:
      api.membership_status === "pending" || api.membership_status === "accepted"
        ? api.membership_status
        : undefined,
    is_member: api.is_member,
    my_role: api.user_role ?? undefined,
    membership_status: api.membership_status ?? undefined,
    memberAvatars: [],
  };
}

export default function ProfileConnectionsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { userId, kind } = route.params;

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<ConnectionUser[]>([]);
  const [communities, setCommunities] = useState<ConnectionCommunity[]>([]);

  const title = kind === "friends" ? "Friends" : "Communities";

  const load = useCallback(async () => {
    if (!token) {
      setError("Sign in to view this list.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const path =
        kind === "friends"
          ? `/api/v1/users/${encodeURIComponent(userId)}/friends`
          : `/api/v1/users/${encodeURIComponent(userId)}/communities`;
      const res = await fetch(`${API_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof json?.error === "string" ? json.error : "Could not load this list.",
        );
      }
      if (kind === "friends") {
        setUsers(Array.isArray(json?.users) ? json.users : []);
        setCommunities([]);
      } else {
        setCommunities(Array.isArray(json?.communities) ? json.communities : []);
        setUsers([]);
      }
    } catch (e) {
      setUsers([]);
      setCommunities([]);
      setError(e instanceof Error ? e.message : "Could not load this list.");
    } finally {
      setLoading(false);
    }
  }, [kind, token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const trimmed = query.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    if (!trimmed) return users;
    return users.filter((user) => {
      const name = displayName(user).toLowerCase();
      const username = (user.username ?? "").toLowerCase();
      return name.includes(trimmed) || username.includes(trimmed);
    });
  }, [trimmed, users]);

  const filteredCommunities = useMemo(() => {
    if (!trimmed) return communities;
    return communities.filter((community) => {
      const name = (community.name ?? "").toLowerCase();
      const category = (community.category ?? "").toLowerCase();
      return name.includes(trimmed) || category.includes(trimmed);
    });
  }, [communities, trimmed]);

  const renderUser = ({ item }: { item: ConnectionUser }) => {
    const name = displayName(item);
    const photo =
      typeof item.profile_photo === "string" && item.profile_photo.trim()
        ? item.profile_photo.trim()
        : "";
    const avatarUser = {
      id: item.id,
      first_name: item.first_name ?? undefined,
      last_name: item.last_name ?? undefined,
      username: item.username ?? undefined,
      name,
    };

    return (
      <Pressable
        onPress={() => navigation.navigate("PublicProfile", { userId: item.id })}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View
            style={[
              styles.avatar,
              { backgroundColor: getUserAvatarColor(avatarUser) },
            ]}
          >
            <Text style={styles.avatarInitials}>
              {getUserInitials(avatarUser)}
            </Text>
          </View>
        )}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
          {item.username ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              @{item.username}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={18} color="#C4C4C4" strokeWidth={2.2} />
      </Pressable>
    );
  };

  const renderCommunity = ({ item }: { item: ConnectionCommunity }) => {
    const photo =
      typeof item.avatar_url === "string" && item.avatar_url.trim()
        ? item.avatar_url.trim()
        : "";
    const members = item.member_count ?? 0;

    return (
      <Pressable
        onPress={() =>
          navigation.navigate("CommunityDetail", {
            community: toCommunityData(item),
          })
        }
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.communityAvatar} />
        ) : (
          <View style={[styles.communityAvatar, styles.communityFallback]}>
            <Users size={18} color={Colors.dark} strokeWidth={2.2} />
          </View>
        )}
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name?.trim() || "Community"}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {members === 1 ? "1 member" : `${members.toLocaleString()} members`}
            {item.category ? ` · ${item.category}` : ""}
          </Text>
        </View>
        <ChevronRight size={18} color="#C4C4C4" strokeWidth={2.2} />
      </Pressable>
    );
  };

  const emptyLabel = error
    ? error
    : trimmed
      ? "No matches."
      : kind === "friends"
        ? "No friends yet."
        : "No communities yet.";

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color="#8C8C8C" strokeWidth={2.2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={
            kind === "friends" ? "Search friends" : "Search communities"
          }
          placeholderTextColor="#8C8C8C"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : kind === "friends" ? (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={
            filteredUsers.length === 0 ? styles.emptyList : styles.list
          }
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          }
        />
      ) : (
        <FlatList
          data={filteredCommunities}
          keyExtractor={(item) => item.id}
          renderItem={renderCommunity}
          contentContainerStyle={
            filteredCommunities.length === 0 ? styles.emptyList : styles.list
          }
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          }
        />
      )}
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 21,
    color: Colors.dark,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    paddingVertical: 0,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#888",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eaeaea",
  },
  rowPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  communityAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  communityFallback: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },
  avatarInitials: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: "#fff",
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  rowMeta: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
});
