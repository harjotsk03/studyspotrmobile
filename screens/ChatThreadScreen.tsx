import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Send } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import type { InboxStackParamList } from "../types/navigation";
import {
  chatPeerDisplayName,
  fetchChatMessages,
  markChatConversationRead,
  mergeMessagesDedupeNewestFirst,
  parseChatMessage,
  sendChatMessage,
  type ChatMessage,
} from "../utils/chatApi";
import {
  emitJoinConversation,
  emitLeaveConversation,
  getOrCreateChatSocket,
} from "../utils/chatSocket";

type Props = NativeStackScreenProps<InboxStackParamList, "ChatThread">;

const LIVE_TAG = "[chat/live]";

function logThread(...args: unknown[]) {
  console.log(LIVE_TAG, "[thread]", ...args);
}

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ChatThreadScreen({ navigation, route }: Props) {
  const { conversationId, peer } = route.params;

  const { token, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const myId = profile?.userProfile?.id ?? "";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [socketJoinError, setSocketJoinError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const loadingOlderRef = useRef(false);

  const title = chatPeerDisplayName(peer);

  const loadInitial = useCallback(async () => {
    if (!token) return;
    setInitialLoading(true);
    try {
      const page = await fetchChatMessages(token, conversationId, {
        limit: 40,
      });
      setMessages(page.messages);
      setNextCursor(page.next_cursor);
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not load messages.",
      );
    } finally {
      setInitialLoading(false);
    }
  }, [token, conversationId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useLayoutEffect(() => {
    const dm = route.params.draftMessage;
    if (typeof dm !== "string" || !dm.trim()) return;
    setDraft(dm.trim());
    navigation.setParams({ draftMessage: undefined });
  }, [conversationId, navigation, route.params.draftMessage]);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void markChatConversationRead(token, conversationId).catch(() => {
        //
      });
      return () => {
        void markChatConversationRead(token, conversationId).catch(() => {
          //
        });
      };
    }, [token, conversationId]),
  );

  useEffect(() => {
    if (!token) {
      logThread("socket effect skip: no token");
      return;
    }

    logThread("socket effect mount", {
      conversationId,
      conversationIdLen: conversationId.length,
    });

    const socket = getOrCreateChatSocket(token);

    const join = () => {
      logThread("join requested", {
        alreadyConnected: socket.connected,
        socketId: socket.id,
      });
      emitJoinConversation(socket, conversationId, (ack) => {
        logThread("join ack handled in UI", ack);
        if (!ack.ok) {
          setSocketJoinError(ack.error ?? "Could not join live chat.");
        } else {
          setSocketJoinError(null);
        }
      });
    };

    const onNew = (payload: unknown) => {
      logThread("message:new received", {
        payloadType: payload === null ? "null" : typeof payload,
        payloadPreview:
          payload && typeof payload === "object"
            ? JSON.stringify(payload).slice(0, 280)
            : String(payload).slice(0, 120),
      });
      const msg = parseChatMessage(payload);
      if (!msg) {
        console.warn(LIVE_TAG, "[thread] message:new parse failed");
        return;
      }
      if (msg.conversation_id !== conversationId) {
        logThread("message:new ignored (different conversation)", {
          msgConversationId: msg.conversation_id,
          screenConversationId: conversationId,
        });
        return;
      }
      logThread("message:new applied", { id: msg.id, sender_id: msg.sender_id });
      setMessages((prev) => mergeMessagesDedupeNewestFirst(prev, [msg]));
    };

    socket.on("message:new", onNew);
    if (socket.connected) {
      logThread("socket already connected → join now");
      join();
    } else {
      logThread("socket not connected → join on connect");
      socket.once("connect", join);
    }

    return () => {
      logThread("socket effect cleanup / leave room", { conversationId });
      socket.off("message:new", onNew);
      socket.off("connect", join);
      emitLeaveConversation(socket, conversationId);
    };
  }, [token, conversationId]);

  const loadOlder = useCallback(async () => {
    if (!token || !nextCursor || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await fetchChatMessages(token, conversationId, {
        limit: 40,
        cursor: nextCursor,
      });
      setMessages((prev) => mergeMessagesDedupeNewestFirst(prev, page.messages));
      setNextCursor(page.next_cursor);
    } catch {
      //
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [token, conversationId, nextCursor]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!token || !text || sendBusy) return;
    setSendBusy(true);
    try {
      const msg = await sendChatMessage(token, conversationId, text);
      setDraft("");
      setMessages((prev) => mergeMessagesDedupeNewestFirst(prev, [msg]));
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not send message.",
      );
    } finally {
      setSendBusy(false);
    }
  }, [token, conversationId, draft, sendBusy]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const mine = Boolean(myId && item.sender_id === myId);
    return (
      <View
        style={[
          styles.msgRow,
          mine ? styles.msgRowMine : styles.msgRowTheirs,
        ]}
      >
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text
            style={[styles.msgBody, mine ? styles.msgBodyMine : styles.msgBodyTheirs]}
          >
            {item.body}
          </Text>
          <Text
            style={[styles.msgTime, mine ? styles.msgTimeMine : styles.msgTimeTheirs]}
          >
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  const canSend = draft.trim().length > 0 && !sendBusy;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <View style={styles.flex}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
          >
            <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {socketJoinError ? (
              <Text style={styles.socketWarn} numberOfLines={1}>
                Live updates unavailable
              </Text>
            ) : null}
          </View>
          <View style={[styles.iconButton, styles.hiddenIcon]} />
        </View>

        {initialLoading ? (
          <ActivityIndicator style={styles.loader} color={Colors.accent} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.25}
            ListFooterComponent={
              loadingOlder ? (
                <ActivityIndicator color={Colors.accent} style={styles.topLoader} />
              ) : nextCursor ? (
                <Pressable onPress={() => void loadOlder()} style={styles.loadMoreWrap}>
                  <Text style={styles.loadMoreText}>Load older messages</Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>No messages yet. Say hello.</Text>
            }
          />
        )}

        <View
          style={[
            styles.composerRow,
            { paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor="#999"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={8000}
            editable={!!token && !sendBusy}
          />
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!canSend}
            onPress={() => void onSend()}
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          >
            {sendBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Send size={20} color="#fff" strokeWidth={2.2} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.light },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
    backgroundColor: Colors.light,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  hiddenIcon: { opacity: 0 },
  headerCopy: { flex: 1, paddingHorizontal: 12 },
  title: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 19,
    textAlign: "center",
  },
  socketWarn: {
    color: "#c45c00",
    fontFamily: Fonts.instrument.medium,
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
  loader: { marginTop: 36 },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    flexGrow: 1,
  },
  msgRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e8e8e8",
  },
  msgBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 21,
  },
  msgBodyMine: { color: "#fff" },
  msgBodyTheirs: { color: Colors.dark },
  msgTime: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 11,
    marginTop: 6,
  },
  msgTimeMine: { color: "rgba(255,255,255,0.85)" },
  msgTimeTheirs: { color: "#888" },
  empty: {
    textAlign: "center",
    color: "#888",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    marginTop: 40,
  },
  topLoader: { marginVertical: 16 },
  loadMoreWrap: { alignItems: "center", paddingVertical: 12 },
  loadMoreText: {
    color: Colors.primary,
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 13,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e8e8e8",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.light,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
});
