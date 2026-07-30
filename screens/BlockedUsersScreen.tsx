import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import Button from "../components/Button";

type BlockedUser = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo?: string | null;
  blocked_at?: string;
};

export default function BlockedUsersScreen() {
  const navigation = useNavigation();
  const { token } = useAuth();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const fetchBlocked = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/blocked`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load.");
      const json = await res.json();
      setUsers(json.users ?? []);
    } catch {
      Alert.alert("Error", "Could not load blocked users.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchBlocked();
  }, [fetchBlocked]);

  const handleUnblock = useCallback(
    async (userId: string) => {
      if (!token) return;
      setUnblockingId(userId);
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/users/${userId}/block`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Could not unblock.");
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      } catch {
        Alert.alert("Error", "Could not unblock user.");
      } finally {
        setUnblockingId(null);
      }
    },
    [token],
  );

  const renderItem = useCallback(
    ({ item }: { item: BlockedUser }) => {
      const displayName = [item.first_name, item.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || item.username || "User";
      const photo =
        typeof item.profile_photo === "string" && item.profile_photo.trim()
          ? item.profile_photo.trim()
          : "";
      const initialsUser = {
        id: item.id,
        first_name: item.first_name ?? undefined,
        last_name: item.last_name ?? undefined,
        username: item.username ?? undefined,
        name: displayName,
      };
      const avatarColor = getUserAvatarColor(initialsUser);
      const initials = getUserInitials(initialsUser);

      return (
        <View style={styles.row}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.rowInfo}>
            <Text style={styles.rowName} numberOfLines={1}>
              {displayName}
            </Text>
            {item.username ? (
              <Text style={styles.rowUsername} numberOfLines={1}>
                @{item.username}
              </Text>
            ) : null}
          </View>
          <Button
            label="Unblock"
            variant="outline"
            size="sm"
            onPress={() => void handleUnblock(item.id)}
            disabled={unblockingId === item.id}
            loading={unblockingId === item.id}
          />
        </View>
      );
    },
    [handleUnblock, unblockingId],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>You haven't blocked anyone.</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
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
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#888",
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eaeaea",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: "#fff",
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  rowUsername: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
});
