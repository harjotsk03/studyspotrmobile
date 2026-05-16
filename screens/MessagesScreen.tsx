import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ArrowLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import type { InboxStackParamList } from "../types/navigation";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import {
  chatPeerDisplayName,
  fetchChatConversations,
  isConversationUnread,
  type ChatConversation,
} from "../utils/chatApi";

function formatListTime(value?: string | null) {
  if (!value || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default function MessagesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [rows, setRows] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const list = await fetchChatConversations(token);
      setRows(list);
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not load conversations.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const openThread = (c: ChatConversation) => {
    const peer = c.other_user ?? undefined;
    navigation.navigate("ChatThread", {
      conversationId: c.id,
      peer,
    });
  };

  const renderRow = ({ item }: { item: ChatConversation }) => {
    const unread = isConversationUnread(item);
    const peer = item.other_user;
    const label = chatPeerDisplayName(peer ?? null);
    const preview =
      typeof item.last_message_preview === "string" &&
      item.last_message_preview.trim()
        ? item.last_message_preview.trim()
        : "Tap to open conversation";
    const when = formatListTime(item.last_message_at);

    const avatarUser = {
      id: peer?.id,
      first_name: peer?.first_name ?? undefined,
      last_name: peer?.last_name ?? undefined,
      username: peer?.username ?? undefined,
      name: label,
    };
    const photo =
      typeof peer?.profile_photo === "string" && peer.profile_photo.trim()
        ? encodeURI(peer.profile_photo.trim())
        : "";

    return (
      <TouchableOpacity
        style={[styles.row, unread && styles.rowUnread]}
        activeOpacity={0.85}
        onPress={() => openThread(item)}
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
            <Text style={styles.avatarLetter}>{getUserInitials(avatarUser)}</Text>
          )}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {label}
            </Text>
            {!!when && (
              <Text style={styles.rowTime} numberOfLines={1}>
                {when}
              </Text>
            )}
          </View>
          <Text style={styles.preview} numberOfLines={2}>
            {preview}
          </Text>
        </View>
        {unread ? <View style={styles.unreadDot} /> : null}
      </TouchableOpacity>
    );
  };

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
          <Text style={styles.title}>Messages</Text>
        </View>
        <View style={[styles.iconButton, styles.hiddenIconButton]} />
      </View>

      {!token ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sign in to message</Text>
          <Text style={styles.emptyBody}>
            Your conversations will appear here once you are signed in.
          </Text>
        </View>
      ) : loading ? (
        <ActivityIndicator style={styles.loader} color={Colors.accent} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyBody}>
                Message someone from their profile to start a chat.
              </Text>
            </View>
          }
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
  loader: { marginTop: 48 },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fff",
  },
  rowUnread: {
    borderColor: "rgba(26, 97, 168, 0.18)",
    backgroundColor: "#F8FBFF",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarLetter: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 18,
    color: "#fff",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  rowTitle: {
    flex: 1,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  rowTime: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 12,
    color: "#888",
  },
  preview: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    lineHeight: 19,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  emptyCard: {
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
  emptyBody: {
    color: "#666",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
  },
});
