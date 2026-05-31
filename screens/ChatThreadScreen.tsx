import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Send, X } from "lucide-react-native";
import SharedAttachmentPreview from "../components/SharedAttachmentPreview";
import EventDetailDrawer, {
  type CommunityEvent,
} from "./EventDetailDrawer";
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
  encodeShareToken,
  extractShareFromBody,
  type SharedAttachmentRef,
} from "../utils/messageShare";

/** Per-user / per-conversation cache key for the most recent messages. */
const THREAD_CACHE_PREFIX = "chat:thread:";
/** Cap the persisted slice so we don't store unbounded history on disk. */
const THREAD_CACHE_LIMIT = 60;

function threadCacheKey(userId: string, conversationId: string) {
  return `${THREAD_CACHE_PREFIX}${userId}:${conversationId}`;
}
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
  /** True only until the disk cache for this thread has been read. Used to
   * avoid flashing an empty state at users who actually have prior messages
   * cached locally. */
  const [hydrated, setHydrated] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [draft, setDraft] = useState("");
  /** When a draft message arrives via route params with a share token (post
   * or spot), we split it: the human-readable caption goes into `draft`
   * (editable) and the parsed ref lives here so we can render a pinned
   * preview card above the input — and re-attach the token at send time. */
  const [attachedShare, setAttachedShare] =
    useState<SharedAttachmentRef | null>(null);
  const [socketJoinError, setSocketJoinError] = useState<string | null>(null);
  /** Local drawer state for taps on shared-event preview cards. Owned here
   * (not inside `SharedAttachmentPreview`) so we render exactly one drawer
   * per thread and avoid a circular import between the preview and drawer. */
  const [openEventDrawer, setOpenEventDrawer] = useState<{
    event: CommunityEvent;
    communityId: string;
  } | null>(null);

  const handleOpenSharedEvent = useCallback(
    (event: CommunityEvent, communityId: string) => {
      setOpenEventDrawer({ event, communityId });
    },
    [],
  );

  const handleCloseSharedEvent = useCallback(() => {
    setOpenEventDrawer(null);
  }, []);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const loadingOlderRef = useRef(false);
  /** Latest `draftMessage` route param we've already consumed. Used to
   * avoid re-applying the same draft on every re-render (without needing
   * to dispatch a stale `setParams` action that React Navigation rejects
   * mid-transition with "SET_PARAMS … not handled by any navigator"). */
  const consumedDraftRef = useRef<string | null>(null);
  /** Live snapshot of the current message count — read inside callbacks so we
   * can decide whether to surface load errors without making those callbacks
   * depend on `messages.length` (which would re-fetch on every new message). */
  const messageCountRef = useRef(0);
  useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages.length]);
  const cacheKey = myId ? threadCacheKey(myId, conversationId) : null;

  const title = chatPeerDisplayName(peer);

  /** Hydrate from disk on mount / when the conversation changes. We do this
   * in an effect (not on first render) so the disk read is non-blocking. */
  useEffect(() => {
    let cancelled = false;
    if (!cacheKey) {
      setMessages([]);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setMessages(parsed as ChatMessage[]);
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
  }, [cacheKey]);

  /** Background refresh — never blocks the UI. Merges into whatever's already
   * on screen from the cache so we don't lose / re-flicker rendered bubbles. */
  const loadInitial = useCallback(async () => {
    if (!token) return;
    try {
      const page = await fetchChatMessages(token, conversationId, {
        limit: 40,
      });
      setMessages((prev) => mergeMessagesDedupeNewestFirst(prev, page.messages));
      setNextCursor(page.next_cursor);
    } catch (e) {
      // Only nag the user if we had nothing cached to fall back on.
      if (messageCountRef.current === 0) {
        Alert.alert(
          "Error",
          e instanceof Error ? e.message : "Could not load messages.",
        );
      }
    }
  }, [token, conversationId]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  /** Persist whatever we've got on screen (capped) for the next visit. */
  useEffect(() => {
    if (!cacheKey || !hydrated) return;
    const slice = messages.slice(0, THREAD_CACHE_LIMIT);
    AsyncStorage.setItem(cacheKey, JSON.stringify(slice)).catch(() => {
      /* best-effort write */
    });
  }, [cacheKey, hydrated, messages]);

  useLayoutEffect(() => {
    const dm = route.params.draftMessage;
    if (typeof dm !== "string" || !dm.trim()) return;
    // The same `dm` may stick around in route.params across re-renders
    // (we deliberately don't try to `setParams` it back to undefined —
    // doing so during a tab→nested-stack transition produces a noisy
    // "SET_PARAMS … not handled" warning in React Navigation 7). Tracking
    // the consumed value here gives us idempotency without the dispatch.
    if (consumedDraftRef.current === dm) return;
    consumedDraftRef.current = dm;

    const { ref, text } = extractShareFromBody(dm);
    if (ref) {
      setAttachedShare(ref);
      setDraft(text);
    } else {
      setDraft(dm.trim());
    }
  }, [conversationId, route.params.draftMessage]);

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
    if (!token || sendBusy) return;
    if (!text && !attachedShare) return;

    // Re-attach the share token before sending so the receiver's
    // ChatThreadScreen can parse it back into a preview card.
    const body = attachedShare
      ? text
        ? `${text}\n${encodeShareToken(attachedShare)}`
        : encodeShareToken(attachedShare)
      : text;

    setSendBusy(true);
    try {
      const msg = await sendChatMessage(token, conversationId, body);
      setDraft("");
      setAttachedShare(null);
      setMessages((prev) => mergeMessagesDedupeNewestFirst(prev, [msg]));
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not send message.",
      );
    } finally {
      setSendBusy(false);
    }
  }, [token, conversationId, draft, sendBusy, attachedShare]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const mine = Boolean(myId && item.sender_id === myId);
    const { ref, text } = extractShareFromBody(item.body);
    const trimmedText = text.trim();
    const hasText = trimmedText.length > 0;
    const timeLabel = formatMessageTime(item.created_at);

    // Layouts:
    //   - Plain message: text bubble with inline timestamp (existing look).
    //   - Share + caption: text bubble (no inline time) → preview card → small
    //     time below the card, hugging the same edge as the bubble.
    //   - Share only: just the preview card with a small time line beneath.

    return (
      <View
        style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}
      >
        <View
          style={[
            styles.msgStack,
            mine ? styles.msgStackMine : styles.msgStackTheirs,
          ]}
        >
          {hasText || !ref ? (
            <View
              style={[
                styles.bubble,
                mine ? styles.bubbleMine : styles.bubbleTheirs,
              ]}
            >
              <Text
                style={[
                  styles.msgBody,
                  mine ? styles.msgBodyMine : styles.msgBodyTheirs,
                ]}
              >
                {hasText ? trimmedText : item.body}
              </Text>
              {!ref ? (
                <Text
                  style={[
                    styles.msgTime,
                    mine ? styles.msgTimeMine : styles.msgTimeTheirs,
                  ]}
                >
                  {timeLabel}
                </Text>
              ) : null}
            </View>
          ) : null}

          {ref ? (
            <SharedAttachmentPreview
              refData={ref}
              token={token}
              isMine={mine}
              onPressEvent={handleOpenSharedEvent}
            />
          ) : null}

          {ref ? (
            <Text
              style={[
                styles.msgTimeBelow,
                mine ? styles.msgTimeBelowMine : styles.msgTimeBelowTheirs,
              ]}
            >
              {timeLabel}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const canSend =
    !sendBusy && (draft.trim().length > 0 || attachedShare !== null);

  return (
    <Fragment>
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
              <Pressable
                onPress={() => void loadOlder()}
                style={styles.loadMoreWrap}
              >
                <Text style={styles.loadMoreText}>Load older messages</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            // Suppress the "no messages" copy until the disk cache has been
            // read so users with prior chats don't see it flash on entry.
            hydrated ? (
              <Text style={styles.empty}>No messages yet. Say hello.</Text>
            ) : null
          }
        />

        {/* Pinned share preview — only when the draft arrived with an
            attached post/spot. Editable caption stays in the input below;
            the actual share token is re-appended at send time. */}
        {attachedShare ? (
          <View style={styles.attachedRow}>
            <View style={styles.attachedCardWrap}>
              <SharedAttachmentPreview
                refData={attachedShare}
                token={token}
                isMine={false}
                onPressEvent={handleOpenSharedEvent}
              />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setAttachedShare(null)}
                style={styles.attachedRemoveBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Remove attached share"
              >
                <X size={16} color={Colors.dark} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.composerRow,
            { paddingBottom: Math.max(insets.bottom, 10) },
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder={attachedShare ? "Add a message…" : "Message"}
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

    {/* Drawer for tapping shared-event preview cards. Rendered as a sibling
        of `KeyboardAvoidingView` (not inside it) so the drawer's Modal +
        Pressables don't interact with the keyboard-avoidance padding —
        which on iOS could silently steal taps on the drawer's RSVP / share
        buttons when no keyboard is open. We pass `communityIsPublic: true`
        as the default — the standalone / community RSVP endpoints enforce
        membership server-side, so the worst case is a clear error rather
        than a wrong UI affordance. */}
    <EventDetailDrawer
      visible={openEventDrawer !== null}
      onClose={handleCloseSharedEvent}
      event={openEventDrawer?.event ?? null}
      communityId={openEventDrawer?.communityId ?? ""}
      token={token}
      communityIsPublic
      onAttendanceChange={(eventId, newCount, newStatus) => {
        // Keep the cached event in sync so re-rendering the message bubble's
        // preview card (or re-opening the drawer) shows the latest count /
        // status without another network round-trip. We thread the change
        // back through the same primer used at share time.
        setOpenEventDrawer((prev) =>
          prev && prev.event.id === eventId
            ? {
                ...prev,
                event: {
                  ...prev.event,
                  attendee_count: newCount,
                  user_rsvp_status: newStatus,
                },
              }
            : prev,
        );
      }}
    />
    </Fragment>
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
  /** Vertical stack of bubble + attachment preview + timestamp. We let the
   * stack size to its content (max 82%) so single-line messages don't get
   * stretched to the width of attachment cards. */
  msgStack: {
    maxWidth: "82%",
    gap: 0,
  },
  msgStackMine: { alignItems: "flex-end" },
  msgStackTheirs: { alignItems: "flex-start" },
  bubble: {
    maxWidth: "100%",
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
  /** Smaller, lower-contrast timestamp displayed below an attachment card
   * (since the card itself doesn't have room for it). */
  msgTimeBelow: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 11,
    color: "#999",
    marginTop: 4,
    paddingHorizontal: 4,
  },
  msgTimeBelowMine: {
    textAlign: "right",
  },
  msgTimeBelowTheirs: {
    textAlign: "left",
  },
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
    paddingBottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e8e8e8",
    backgroundColor: "#fff",
  },
  /** "Pinned" share attachment sitting directly above the input row. The
   * remove button overlaps the top-right corner of the preview so the
   * composer doesn't need an extra horizontal column. */
  attachedRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e8e8e8",
  },
  attachedCardWrap: {
    position: "relative",
    alignSelf: "flex-start",
    paddingTop: 8,
    paddingRight: 8,
  },
  attachedRemoveBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dcdcdc",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
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
