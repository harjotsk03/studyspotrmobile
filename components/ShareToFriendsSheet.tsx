import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, MessageCircle, Search } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useToast } from "../context/ToastContext";
import {
  chatPeerDisplayName,
  fetchChatConversations,
  sendChatMessage,
  type ChatConversation,
  type ChatOtherUser,
} from "../utils/chatApi";
import { encodeShareToken } from "../utils/messageShare";
import { primeSharedAttachmentEventCache } from "./SharedAttachmentPreview";
import Button from "./Button";
import type { FeedPost } from "../utils/feedApi";
import type { StudySpot } from "../context/SpotsContext";
import type { CommunityData } from "../screens/CommunityDetailScreen";
import type { CommunityEvent } from "../screens/EventDetailDrawer";
import { navigateToInboxMessagesList } from "../utils/navigateToInboxChat";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

/** Discriminated union describing what's being shared. Keep this typed at
 * the call site so we can build the correct share token without having to
 * inspect a generic blob. */
export type ShareTarget =
  | { kind: "post"; post: FeedPost }
  | { kind: "spot"; spot: StudySpot }
  | { kind: "community"; community: CommunityData }
  | { kind: "event"; event: CommunityEvent; communityId: string };

type Props = {
  visible: boolean;
  /** What the user is sending. Pass `null` to render a no-op. */
  attachment: ShareTarget | null;
  token: string | null;
  navigation: NavigationProp<ParamListBase>;
  onClose: () => void;
  /**
   * Fired once the share has actually been sent (not on a plain dismiss).
   * Use it to also close any parent drawer/modal the sheet was opened from.
   */
  onShared?: () => void;
};

// Dark sheet palette (matches the share-sheet design reference).
const SHEET_BG = "#FFFFFF";
const SEARCH_BG = "#F1F2F4";
const MUTED = "#6B6F76";
const TEXT = Colors.dark;
const INPUT_BG = "#F1F2F4";
const COLUMNS = 3;
const AVATAR_SIZE = 88;

function sortConversations(list: ChatConversation[]): ChatConversation[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.last_message_at ?? 0).getTime();
    const tb = new Date(b.last_message_at ?? 0).getTime();
    return tb - ta;
  });
}

function peerSearchHaystack(peer: ChatOtherUser): string {
  const name = chatPeerDisplayName(peer).toLowerCase();
  const u = (peer.username ?? "").replace(/^@/, "").toLowerCase();
  return `${name} ${u}`;
}

function AvatarCircle({ peer, size }: { peer: ChatOtherUser; size: number }) {
  const label = chatPeerDisplayName(peer);
  const initialsUser = {
    id: peer.id,
    first_name: peer.first_name ?? undefined,
    last_name: peer.last_name ?? undefined,
    username: peer.username ?? undefined,
    name: label,
  };
  const photo =
    typeof peer.profile_photo === "string" && peer.profile_photo.trim()
      ? peer.profile_photo.trim()
      : "";

  return (
    <View
      style={[
        styles.avatarRound,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: getUserAvatarColor(initialsUser),
        },
      ]}
    >
      {photo ? (
        <Image source={{ uri: encodeURI(photo) }} style={styles.avatarImg} />
      ) : (
        <Text style={[styles.avatarLetter, { fontSize: Math.round(size * 0.36) }]}>
          {getUserInitials(initialsUser)}
        </Text>
      )}
    </View>
  );
}

/** The `[[share:…]]` token that the chat thread turns into a preview card.
 * No default sentence is added — the sender's own note (if any) is the only
 * text that travels with it. */
function shareTokenFor(attachment: ShareTarget): string {
  switch (attachment.kind) {
    case "post":
      return encodeShareToken({ kind: "post", id: attachment.post.id });
    case "spot":
      return encodeShareToken({ kind: "spot", id: attachment.spot.id });
    case "community":
      return encodeShareToken({
        kind: "community",
        id: attachment.community.id,
      });
    case "event":
      return encodeShareToken({
        kind: "event",
        id: attachment.event.id,
        communityId: attachment.communityId,
      });
  }
}

function attachmentSubject(attachment: ShareTarget): string {
  switch (attachment.kind) {
    case "post":
      return "post";
    case "spot":
      return "study spot";
    case "community":
      return "community";
    case "event":
      return "event";
  }
}

export default function ShareToFriendsSheet({
  visible,
  attachment: attachmentProp,
  token,
  navigation,
  onClose,
  onShared,
}: Props) {
  // Callers null the attachment the instant they close; keep the last one
  // so the sheet can finish its slide-down instead of vanishing.
  const lastAttachment = useRef<ShareTarget | null>(null);
  if (attachmentProp) lastAttachment.current = attachmentProp;
  const attachment = attachmentProp ?? lastAttachment.current;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);

  // Slide-up / slide-down + backdrop fade, kept mounted until the exit
  // animation finishes.
  const baseSheetHeight = Math.round(windowHeight * 0.72);
  const [kbHeight, setKbHeight] = useState(0);
  const [messageFocused, setMessageFocused] = useState(false);
  useEffect(() => {
    const showEv = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEv = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(showEv, (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const b = Keyboard.addListener(hideEv, () => setKbHeight(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  // Searching: keyboard just overlays the sheet (no resize, no jump).
  // Typing a message: sheet rides above the keyboard but is capped so it
  // never stretches to full screen.
  const liftForKeyboard = messageFocused && kbHeight > 0;
  const sheetHeight = liftForKeyboard
    ? Math.min(baseSheetHeight, windowHeight - kbHeight - insets.top - 16)
    : baseSheetHeight;
  const appear = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  // Swipe-down-to-close. The sheet follows the finger; releasing past a
  // threshold (or with a flick) dismisses it. When the grid is scrolled we
  // leave the gesture to the list so scrolling still works.
  const drag = useRef(new Animated.Value(0)).current;
  const gridScrollY = useRef(0);
  const dragBase = useRef(0);
  // When everything fits, the list must not be a native scroller at all -
  // otherwise it swallows the touch and the sheet only drags from avatars.
  const [gridContentH, setGridContentH] = useState(0);
  const [gridLayoutH, setGridLayoutH] = useState(0);
  const gridScrollable = gridContentH > gridLayoutH + 1;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const sheetHeightRef = useRef(sheetHeight);
  sheetHeightRef.current = sheetHeight;

  const panResponder = useRef(
    PanResponder.create({
      // Takes over as soon as the list is at its top and the finger moves
      // down - including mid-gesture after scrolling back up to the top.
      // Claim touches that land on empty space (children like avatars,
      // inputs and buttons still win theirs), so any part of the sheet drags.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        g.dy > 3 && g.dy > Math.abs(g.dx) && gridScrollY.current <= 0,
      onPanResponderGrant: (_, g) => {
        dragBase.current = g.dy; // ignore distance covered while scrolling
        Keyboard.dismiss();
      },
      onPanResponderMove: (_, g) => {
        // While the list is scrolled, let it scroll; the sheet only follows
        // the finger once the list is back at the top.
        if (gridScrollY.current > 0) {
          dragBase.current = g.dy;
          return;
        }
        drag.setValue(Math.max(0, g.dy - dragBase.current));
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        const pulled = g.dy - dragBase.current;
        if (pulled > 60 || (g.vy > 0.4 && pulled > 8)) {
          Animated.timing(drag, {
            toValue: sheetHeightRef.current,
            duration: 150,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => onCloseRef.current());
        } else {
          Animated.spring(drag, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  // Mount first (sheet parked off-screen), then start the slide-up on the
  // next frame so the animation isn't eaten by the Modal mounting.
  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      setMounted(true);
    }
  }, [visible, drag]);

  useEffect(() => {
    if (!mounted || !visible) return;
    appear.setValue(0);
    const raf = requestAnimationFrame(() => {
      Animated.timing(appear, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => cancelAnimationFrame(raf);
  }, [mounted, visible, appear]);

  // Dismiss (backdrop tap, send, back button) uses the same quick ease-out
  // as the swipe-to-close.
  useEffect(() => {
    if (visible) return;
    Animated.timing(appear, {
      toValue: 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, appear]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchChatConversations(token);
      const withPeer = list.filter((c) => c.other_user?.id);
      setConversations(sortConversations(withPeer));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load your conversations.",
      );
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (visible && token) void load();
  }, [visible, token, load]);

  useEffect(() => {
    if (!visible) {
      setSearchQuery("");
      setMessage("");
      setSelectedIds([]);
      setSendError(null);
      setSending(false);
    }
  }, [visible]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const peer = c.other_user;
      return peer?.id ? peerSearchHaystack(peer).includes(q) : false;
    });
  }, [conversations, searchQuery]);

  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
    setSendError(null);
  }, []);

  const handleSend = useCallback(async () => {
    if (!attachment || !token || sending || selectedIds.length === 0) return;

    if (attachment.kind === "event") {
      // The sender's own preview card needs the event on hand.
      primeSharedAttachmentEventCache(attachment.event, attachment.communityId);
    }

    const note = message.trim();
    const shareToken = shareTokenFor(attachment);
    const body = note ? `${note}\n${shareToken}` : shareToken;

    setSending(true);
    setSendError(null);
    Keyboard.dismiss();

    const results = await Promise.allSettled(
      selectedIds.map((id) => sendChatMessage(token, id, body)),
    );

    const failedIds = selectedIds.filter(
      (_, i) => results[i].status === "rejected",
    );
    setSending(false);

    if (failedIds.length === 0) {
      showToast(
        selectedIds.length === 1
          ? "Sent"
          : `Sent to ${selectedIds.length} people`,
      );
      onClose();
      onShared?.();
      return;
    }

    // Keep only the people it failed for so "Send" retries just those.
    setSelectedIds(failedIds);
    setSendError(
      failedIds.length === selectedIds.length
        ? "Couldn't send. Please try again."
        : "Some messages didn't send. Tap Send to retry.",
    );
  }, [attachment, token, sending, selectedIds, message, showToast, onClose, onShared]);

  const goMessages = useCallback(() => {
    onClose();
    requestAnimationFrame(() => navigateToInboxMessagesList(navigation));
  }, [navigation, onClose]);

  const renderItem = useCallback(
    ({ item }: { item: ChatConversation }) => {
      const peer = item.other_user;
      if (!peer?.id) return null;
      const selected = selectedIds.includes(item.id);
      const label = chatPeerDisplayName(peer);
      return (
        <Pressable
          style={styles.cell}
          onPress={() => toggle(item.id)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={label}
        >
          <View style={styles.avatarWrap}>
            <AvatarCircle peer={peer} size={AVATAR_SIZE} />
            {selected ? (
              <View style={styles.checkBadge}>
                <Check size={14} color="#fff" strokeWidth={3.2} />
              </View>
            ) : null}
          </View>
          <Text style={styles.cellLabel} numberOfLines={2}>
            {label}
          </Text>
        </Pressable>
      );
    },
    [selectedIds, toggle],
  );

  if (!mounted || !attachment) return null;

  const subject = attachmentSubject(attachment);
  const hasSelection = selectedIds.length > 0;

  const translateY = appear.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight, 0],
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: Animated.multiply(
              appear,
              drag.interpolate({
                inputRange: [0, sheetHeight],
                outputRange: [1, 0],
                extrapolate: "clamp",
              }),
            ),
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close"
        />
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={liftForKeyboard && Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              transform: [{ translateY: Animated.add(translateY, drag) }],
            },
          ]}
        >
          <View style={styles.handleZone}>
            <View style={styles.handle} />
          </View>

          <View style={styles.searchWrap}>
            <Search size={18} color={MUTED} strokeWidth={2.2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor={MUTED}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              keyboardAppearance="light"
            />
          </View>

          {loading ? (
            <ActivityIndicator style={styles.centerSpinner} color={Colors.primary} />
          ) : error ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>Could not load chats</Text>
              <Text style={styles.emptySub}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
                <Text style={styles.retryLabel}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MessageCircle size={44} color="#B5B9C0" strokeWidth={2} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptySub}>
                Message someone first, then you can share a {subject} in one
                tap.
              </Text>
              <TouchableOpacity style={styles.ctaBtn} onPress={goMessages}>
                <Text style={styles.ctaLabel}>Open messages</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              style={styles.grid}
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              numColumns={COLUMNS}
              extraData={selectedIds}
              scrollEnabled={gridScrollable}
              onContentSizeChange={(_, h) => setGridContentH(h)}
              onLayout={(e) => setGridLayoutH(e.nativeEvent.layout.height)}
              bounces={false}
              overScrollMode="never"
              onScroll={(e) => {
                gridScrollY.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.gridContent}
              ListEmptyComponent={
                <Text style={styles.searchEmpty}>No chats match.</Text>
              }
            />
          )}

          {hasSelection ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              {sendError ? (
                <Text style={styles.sendError}>{sendError}</Text>
              ) : null}
              <TextInput
                style={styles.messageInput}
                placeholder="Write a message..."
                placeholderTextColor={MUTED}
                value={message}
                onChangeText={setMessage}
                onFocus={() => setMessageFocused(true)}
                onBlur={() => setMessageFocused(false)}
                keyboardAppearance="light"
                multiline
                maxLength={1000}
              />
              <Button
                label="Send"
                size="lg"
                fullWidth
                loading={sending}
                onPress={() => void handleSend()}
              />
            </View>
          ) : (
            <View style={{ height: Math.max(insets.bottom, 12) }} />
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  kav: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D0D3D8",
  },
  handleZone: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 14,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 24,
    backgroundColor: SEARCH_BG,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 17,
    color: TEXT,
    paddingVertical: 0,
  },
  grid: {
    flex: 1,
    marginTop: 12,
  },
  gridContent: {
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  cell: {
    width: `${100 / COLUMNS}%`,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarRound: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarLetter: {
    fontFamily: Fonts.gabarito.semiBold,
    color: "#fff",
  },
  checkBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    borderWidth: 2.5,
    borderColor: SHEET_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLabel: {
    marginTop: 8,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    lineHeight: 18,
    color: TEXT,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: SHEET_BG,
  },
  messageInput: {
    maxHeight: 96,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 12 : 8,
    paddingBottom: Platform.OS === "ios" ? 12 : 8,
    borderRadius: 16,
    backgroundColor: INPUT_BG,
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: TEXT,
  },
  sendError: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#D93025",
  },
  searchEmpty: {
    paddingTop: 28,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: MUTED,
  },
  centerSpinner: {
    marginTop: 48,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 16,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: TEXT,
    textAlign: "center",
  },
  emptySub: {
    marginTop: 8,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: MUTED,
    lineHeight: 22,
    textAlign: "center",
  },
  ctaBtn: {
    marginTop: 20,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  ctaLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: "#fff",
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  retryLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.primary,
  },
});
