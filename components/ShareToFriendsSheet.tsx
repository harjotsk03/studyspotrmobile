import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, MessageCircle, Search } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import {
  chatPeerDisplayName,
  fetchChatConversations,
  type ChatConversation,
  type ChatOtherUser,
} from "../utils/chatApi";
import { communityShareDraftForMessage } from "../utils/communityShareDraft";
import { eventShareDraftForMessage } from "../utils/eventShareDraft";
import { feedPostShareDraftForMessage } from "../utils/feedPostShareDraft";
import { spotShareDraftForMessage } from "../utils/spotShareDraft";
import { primeSharedAttachmentEventCache } from "./SharedAttachmentPreview";
import type { FeedPost } from "../utils/feedApi";
import type { StudySpot } from "../context/SpotsContext";
import type { CommunityData } from "../screens/CommunityDetailScreen";
import type { CommunityEvent } from "../screens/EventDetailDrawer";
import {
  navigateToInboxChatThread,
  navigateToInboxMessagesList,
} from "../utils/navigateToInboxChat";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

/** Discriminated union describing what's being shared. Keep this typed at
 * the call site so we can build the correct draft body (and headline copy)
 * without having to inspect a generic blob. */
export type ShareTarget =
  | { kind: "post"; post: FeedPost }
  | { kind: "spot"; spot: StudySpot }
  | { kind: "community"; community: CommunityData }
  | { kind: "event"; event: CommunityEvent; communityId: string };

type Props = {
  visible: boolean;
  /** What the user is sending. Pass `null` to render a no-op (keeps the
   * Modal mounted but inert, matching the pattern used by parent screens
   * for delayed unmount during the slide-out animation). */
  attachment: ShareTarget | null;
  token: string | null;
  navigation: NavigationProp<ParamListBase>;
  onClose: () => void;
  /**
   * Fired when the user actually commits to sharing — i.e. picks a friend
   * (or hits "see all conversations"), and we're about to navigate away to
   * a chat thread. Distinct from `onClose`, which fires for *every* dismiss
   * (including the user just backing out of the sheet). Use this to also
   * close any parent drawer/modal the share sheet was opened from, so the
   * user isn't left with the parent hanging around behind the chat screen.
   */
  onShared?: () => void;
};

/** Recent chats on the horizontal “quick send” rail. */
const QUICK_SEND_LIMIT = 10;

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

function AvatarCircle(props: { peer: ChatOtherUser; size: number }) {
  const { peer, size } = props;
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
  const color = getUserAvatarColor(initialsUser);
  const r = size / 2;

  return (
    <View
      style={[
        styles.avatarRound,
        { width: size, height: size, borderRadius: r, backgroundColor: color },
      ]}
    >
      {photo ? (
        <Image source={{ uri: encodeURI(photo) }} style={styles.avatarImg} />
      ) : (
        <Text
          style={[
            styles.avatarLetterSmall,
            { fontSize: Math.round(15 * (size / 58)) },
          ]}
        >
          {getUserInitials(initialsUser)}
        </Text>
      )}
    </View>
  );
}

function quickChipDisplayName(peer: ChatOtherUser): string {
  const raw = `${peer.first_name ?? ""} ${peer.last_name ?? ""}`.trim();
  const firstRaw = raw.split(/\s+/)[0]?.trim();
  if (firstRaw) return firstRaw.slice(0, 11).trimEnd();
  const u = (peer.username ?? "").replace(/^@/, "").trim();
  if (u) return u.length > 10 ? `@${u.slice(0, 9)}…` : `@${u}`;
  const full = chatPeerDisplayName(peer);
  const short = full.slice(0, 11).trimEnd();
  return short || "?";
}

/** Build the prefilled chat composer text for whichever resource the user
 * tapped "share" on. Always appends a `[[share:<kind>:<id>]]` token that the
 * receiver's ChatThreadScreen resolves into a rich preview card. */
function draftForAttachment(attachment: ShareTarget): string {
  switch (attachment.kind) {
    case "post":
      return feedPostShareDraftForMessage(attachment.post);
    case "spot":
      return spotShareDraftForMessage(attachment.spot);
    case "community":
      return communityShareDraftForMessage(attachment.community);
    case "event":
      return eventShareDraftForMessage(
        attachment.event,
        attachment.communityId,
      );
  }
}

/** Human-readable noun used in onboarding copy ("share <subject>s in one
 * tap"). Falls back to "post" for backward-compatible phrasing. */
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
  attachment,
  token,
  navigation,
  onClose,
  onShared,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);

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
    if (visible && token) {
      void load();
    }
  }, [visible, token, load]);

  useEffect(() => {
    if (!visible) {
      setMode("quick");
      setSearchQuery("");
    }
  }, [visible]);

  const draft = useMemo(
    () => (attachment ? draftForAttachment(attachment) : ""),
    [attachment],
  );
  const subject = attachment ? attachmentSubject(attachment) : "post";
  const introCopy =
    subject === "post"
      ? "Tap a friend to open the chat — your share is drafted. Use"
      : `Tap a friend to open the chat — your ${subject} share is drafted. Use`;

  // Pre-fill the receiver-style preview cache with whatever the sender
  // already has on hand. Right now we only do this for events because the
  // backend's standalone `/api/v1/events/:id` GET may not exist on every
  // deploy yet, and without this prime the sender would see a broken
  // "Event unavailable" card in their own composer / sent bubble. Cheap to
  // run; subsequent shares of the same event just overwrite with fresher
  // data.
  const primeCacheForAttachment = useCallback((target: ShareTarget) => {
    if (target.kind === "event") {
      primeSharedAttachmentEventCache(target.event, target.communityId);
    }
  }, []);

  const handlePick = useCallback(
    (c: ChatConversation) => {
      if (!attachment) return;
      primeCacheForAttachment(attachment);
      onClose();
      onShared?.();
      requestAnimationFrame(() => {
        navigateToInboxChatThread(navigation, {
          conversationId: c.id,
          peer: c.other_user ?? undefined,
          draftMessage: draft,
        });
      });
    },
    [attachment, navigation, draft, onClose, onShared, primeCacheForAttachment],
  );

  const goMessages = useCallback(() => {
    if (attachment) primeCacheForAttachment(attachment);
    onClose();
    onShared?.();
    requestAnimationFrame(() => navigateToInboxMessagesList(navigation));
  }, [attachment, navigation, onClose, onShared, primeCacheForAttachment]);

  const quickFriends = useMemo(
    () => conversations.slice(0, QUICK_SEND_LIMIT),
    [conversations],
  );

  const filteredForSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const peer = c.other_user;
      if (!peer?.id) return false;
      return peerSearchHaystack(peer).includes(q);
    });
  }, [conversations, searchQuery]);

  const openFull = useCallback(() => {
    setMode("full");
    setSearchQuery("");
  }, []);

  const backToQuick = useCallback(() => {
    setMode("quick");
    setSearchQuery("");
  }, []);

  const renderQuickItem = useCallback(
    ({ item }: { item: ChatConversation }) => {
      const peer = item.other_user;
      if (!peer?.id) return null;
      const label = quickChipDisplayName(peer);
      return (
        <Pressable
          style={styles.quickChip}
          accessibilityRole="button"
          accessibilityLabel={`Send to ${chatPeerDisplayName(peer)}`}
          onPress={() => handlePick(item)}
        >
          <AvatarCircle peer={peer} size={58} />
          <Text style={styles.quickChipLabel} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      );
    },
    [handlePick],
  );

  const renderRow = useCallback(
    ({ item }: { item: ChatConversation }) => {
      const peer = item.other_user;
      if (!peer?.id) return null;
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
      const color = getUserAvatarColor(initialsUser);

      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Send to ${label}`}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => handlePick(item)}
        >
          <View style={[styles.avatar, { backgroundColor: color }]}>
            {photo ? (
              <Image
                source={{ uri: encodeURI(photo) }}
                style={styles.avatarImg}
              />
            ) : (
              <Text style={styles.avatarLetter}>
                {getUserInitials(initialsUser)}
              </Text>
            )}
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {label}
            </Text>
            {typeof item.last_message_preview === "string" &&
            item.last_message_preview.trim() ? (
              <Text style={styles.rowPreview} numberOfLines={1}>
                {item.last_message_preview.trim()}
              </Text>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [handlePick],
  );

  if (!visible || !attachment) return null;

  const showSeeMoreLinks = conversations.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.sheet, { paddingTop: insets.top + 8 }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheetHeader}>
          {mode === "full" ? (
            <TouchableOpacity
              onPress={backToQuick}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back to quick send"
              style={styles.headerIconBtn}
            >
              <ChevronLeft size={24} color={Colors.dark} strokeWidth={2.2} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.sheetTitle}>
            {mode === "full" ? "All chats" : "Quick send"}
          </Text>
          <View style={styles.sheetHeaderTrailing} accessibilityElementsHidden />
        </View>

        {mode === "quick" ? (
          <View style={styles.quickBody}>
            <Text style={styles.intro}>
              {introCopy} <Text style={styles.introEm}>See more</Text> to search
              everyone you message.
            </Text>

            {loading ? (
              <ActivityIndicator
                style={styles.centerSpinner}
                color={Colors.accent}
              />
            ) : error ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>Could not load chats</Text>
                <Text style={styles.emptySub}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => void load()}
                >
                  <Text style={styles.retryLabel}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : conversations.length === 0 ? (
              <View style={styles.emptyWrap}>
                <MessageCircle size={44} color="#ccc" strokeWidth={2} />
                <Text style={styles.emptyTitle}>No conversations yet</Text>
                <Text style={styles.emptySub}>
                  Message someone first, then you can share {subject}s in one
                  tap.
                </Text>
                <TouchableOpacity style={styles.ctaBtn} onPress={goMessages}>
                  <Text style={styles.ctaLabel}>Open messages</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.sectionEyebrow}>Suggested</Text>
                <FlatList
                  horizontal
                  data={quickFriends}
                  keyExtractor={(item) => item.id}
                  renderItem={renderQuickItem}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickRail}
                  keyboardShouldPersistTaps="handled"
                />
                {showSeeMoreLinks ? (
                  <Pressable
                    onPress={openFull}
                    style={({ pressed }) => [
                      styles.seeMoreRow,
                      pressed && styles.seeMorePressed,
                    ]}
                  >
                    <Text style={styles.seeMoreText}>
                      See more
                      {conversations.length > QUICK_SEND_LIMIT
                        ? ` · ${conversations.length} chats`
                        : ""}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredForSearch}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 24 },
            ]}
            ListHeaderComponent={
              <View style={styles.searchWrap}>
                <Search size={18} color="#888" strokeWidth={2} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search chats"
                  placeholderTextColor="#999"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.searchEmpty}>No chats match.</Text>
            }
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
  },
  headerIconBtn: {
    width: 72,
    justifyContent: "center",
    paddingVertical: 2,
  },
  sheetCancel: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 16,
    color: Colors.dark,
    width: 72,
  },
  sheetTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
    flex: 1,
    textAlign: "center",
  },
  sheetHeaderTrailing: {
    width: 72,
  },
  quickBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
  },
  intro: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
    marginBottom: 18,
  },
  introEm: {
    fontFamily: Fonts.instrument.semiBold,
    color: Colors.dark,
  },
  sectionEyebrow: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#777",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  quickRail: {
    paddingRight: 12,
    paddingVertical: 4,
    paddingBottom: 8,
    minHeight: 96,
  },
  quickChip: {
    alignItems: "center",
    width: 80,
    marginRight: 4,
    paddingVertical: 4,
  },
  quickChipLabel: {
    marginTop: 8,
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
    color: Colors.dark,
    textAlign: "center",
    width: "100%",
  },
  avatarRound: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  seeMoreRow: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#f2f2f2",
    borderWidth: 1,
    borderColor: "#e6e6e6",
  },
  seeMorePressed: {
    opacity: 0.85,
    backgroundColor: "#eaeaea",
  },
  seeMoreText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    flexGrow: 1,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#f4f4f4",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: Colors.dark,
    paddingVertical: Platform.OS === "ios" ? 4 : 2,
    minHeight: Platform.OS === "ios" ? 28 : undefined,
  },
  searchEmpty: {
    paddingTop: 28,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#888",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ececec",
  },
  rowPressed: {
    backgroundColor: "#f5f5f5",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    fontSize: 17,
    color: "#fff",
  },
  avatarLetterSmall: {
    fontFamily: Fonts.gabarito.semiBold,
    color: "#fff",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  rowPreview: {
    marginTop: 3,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
  },
  centerSpinner: {
    marginTop: 48,
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 12,
  },
  emptyTitle: {
    marginTop: 16,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    textAlign: "center",
  },
  emptySub: {
    marginTop: 8,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
    textAlign: "center",
  },
  ctaBtn: {
    marginTop: 20,
    backgroundColor: Colors.dark,
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
