import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Search, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import {
  createDirectConversation,
  type ChatConversation,
  type ChatOtherUser,
} from "../utils/chatApi";

type Props = {
  visible: boolean;
  token: string | null;
  onClose: () => void;
  /** Called once a direct conversation exists with the picked user. */
  onStarted: (conversation: ChatConversation, peer: ChatOtherUser | null) => void;
};

type UserResult = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo?: string | null;
};

function displayName(u: UserResult) {
  const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return full || (u.username ? `@${u.username.replace(/^@/, "")}` : "User");
}

export default function NewMessageModal({
  visible,
  token,
  onClose,
  onStarted,
}: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const myId = profile?.userProfile?.id ?? null;
  const [friends, setFriends] = useState<UserResult[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setError(null);
      setStartingId(null);
    }
  }, [visible]);

  // Messaging is friends-only: load the viewer's friends once per open and
  // filter locally as they type.
  useEffect(() => {
    if (!visible || !token || !myId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/users/${encodeURIComponent(myId)}/friends`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        setFriends(Array.isArray(json?.users) ? json.users : []);
      } catch {
        if (!cancelled) setFriends([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, token, myId]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    setResults(
      q
        ? friends.filter((u) =>
            `${displayName(u)} ${u.username ?? ""}`.toLowerCase().includes(q),
          )
        : friends,
    );
  }, [query, friends]);

  const pick = async (u: UserResult) => {
    if (!token || startingId) return;
    setStartingId(u.id);
    setError(null);
    try {
      const r = await createDirectConversation(token, u.id);
      Keyboard.dismiss();
      onStarted(r.conversation, r.other_user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start chat.");
    } finally {
      setStartingId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text style={styles.title}>New message</Text>
          <TouchableOpacity
            style={styles.headerSide}
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="Close"
          >
            <X size={22} color={Colors.dark} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Search size={18} color="#6B6F76" strokeWidth={2.2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends"
            placeholderTextColor="#8A8F96"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator
                style={styles.spinner}
                color={Colors.primary}
              />
            ) : (
              <Text style={styles.hint}>
                {query.trim()
                  ? "No friends found."
                  : "Add friends to start messaging them."}
              </Text>
            )
          }
          renderItem={({ item }) => {
            const name = displayName(item);
            const avatarUser = {
              id: item.id,
              first_name: item.first_name ?? undefined,
              last_name: item.last_name ?? undefined,
              username: item.username ?? undefined,
              name,
            };
            const photo = item.profile_photo?.trim()
              ? encodeURI(item.profile_photo.trim())
              : "";
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.6}
                onPress={() => void pick(item)}
              >
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: getUserAvatarColor(avatarUser) },
                  ]}
                >
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarLetter}>
                      {getUserInitials(avatarUser)}
                    </Text>
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  {item.username ? (
                    <Text style={styles.username} numberOfLines={1}>
                      @{item.username.replace(/^@/, "")}
                    </Text>
                  ) : null}
                </View>
                {startingId === item.id ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerSide: { width: 32, alignItems: "flex-end" },
  title: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 18,
    color: Colors.dark,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECEEF0",
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: Colors.dark,
    paddingVertical: 0,
  },
  list: { paddingTop: 10, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 48, height: 48 },
  avatarLetter: { fontFamily: Fonts.gabarito.bold, fontSize: 18, color: "#fff" },
  rowBody: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  username: {
    marginTop: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#6B6F76",
  },
  hint: {
    paddingTop: 32,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#8A8F96",
  },
  spinner: { marginTop: 32 },
  error: {
    marginHorizontal: 20,
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#D93025",
  },
});
