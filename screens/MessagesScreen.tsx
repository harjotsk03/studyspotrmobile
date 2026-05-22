import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { describeBodyForPreview } from "../utils/messageShare";

/** Per-user cache key for the conversations list. */
const CACHE_KEY_PREFIX = "chat:conversations:";
const cacheKeyForUser = (userId: string) => `${CACHE_KEY_PREFIX}${userId}`;

/** Stable identity check so we skip re-renders when the network returns the
 * same data we already had cached. */
function rowsAreEqual(
  a: ChatConversation[],
  b: ChatConversation[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.last_message_preview !== y.last_message_preview ||
      x.last_message_at !== y.last_message_at ||
      isConversationUnread(x) !== isConversationUnread(y)
    ) {
      return false;
    }
  }
  return true;
}

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
  const { token, profile } = useAuth();
  const userId = profile?.userProfile?.id ?? null;

  const [rows, setRows] = useState<ChatConversation[]>([]);
  /** True only until we've either restored the cache or made our first network
   * round-trip; after that we always render the list (with cached rows). */
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef<ChatConversation[]>([]);

  /** Updates `rows` only if the new list differs from the previous one, so we
   * don't flicker the UI when the network confirms what we already had. */
  const applyRows = useCallback((next: ChatConversation[]) => {
    if (!rowsAreEqual(rowsRef.current, next)) {
      rowsRef.current = next;
      setRows(next);
    }
  }, []);

  const persistRows = useCallback(
    async (list: ChatConversation[]) => {
      if (!userId) return;
      try {
        await AsyncStorage.setItem(
          cacheKeyForUser(userId),
          JSON.stringify(list),
        );
      } catch {
        /* best-effort cache write */
      }
    },
    [userId],
  );

  /** Read the cached conversations once when we know who's signed in. We do
   * this in an effect (not on first render) so the disk read never blocks the
   * initial paint; the empty-state UI shows immediately and is replaced with
   * cached rows once they're available. */
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      rowsRef.current = [];
      setRows([]);
      setHydrated(true);
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKeyForUser(userId));
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            applyRows(parsed as ChatConversation[]);
          }
        }
      } catch {
        /* corrupt cache — ignore */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, applyRows]);

  /** Background refetch — never flips a full-screen spinner. The only UI
   * indicator is the pull-to-refresh spinner the user explicitly triggered. */
  const load = useCallback(async () => {
    if (!token) {
      applyRows([]);
      setError(null);
      return;
    }
    try {
      const list = await fetchChatConversations(token);
      applyRows(list);
      setError(null);
      void persistRows(list);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not load conversations.";
      // Only surface the error visually when we have nothing cached to fall
      // back on — otherwise we silently keep showing the last good list.
      if (rowsRef.current.length === 0) setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [token, applyRows, persistRows]);

  useFocusEffect(
    useCallback(() => {
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
    // The last-message preview can contain inline `[[share:…]]` tokens
    // when the most recent message in the thread is a shared post/spot/
    // community/event. Swap them out for a human-readable summary so the
    // raw bracket syntax never reaches the UI.
    const rawPreview =
      typeof item.last_message_preview === "string"
        ? item.last_message_preview
        : "";
    const previewText = describeBodyForPreview(rawPreview).trim();
    const preview = previewText ? previewText : "Tap to open conversation";
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
            // While the disk cache is still being read, render nothing rather
            // than a "no conversations" empty state so we don't flash the
            // wrong copy at users who do have prior messages.
            !hydrated ? null : error ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Couldn't load messages</Text>
                <Text style={styles.emptyBody}>{error}</Text>
                <TouchableOpacity
                  onPress={onRefresh}
                  activeOpacity={0.7}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryLabel}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No conversations yet</Text>
                <Text style={styles.emptyBody}>
                  Message someone from their profile to start a chat.
                </Text>
              </View>
            )
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
  retryButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  retryLabel: {
    color: Colors.primary,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
  },
});
