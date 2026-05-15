import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowUp,
  AtSign,
  Heart,
  Image as ImageIcon,
  ListFilter,
  Smile,
  ThumbsDown,
  X,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import {
  MAX_FEED_COMMENT_LENGTH,
  createFeedComment,
  deleteFeedComment,
  feedAuthorDisplayName,
  fetchFeedPostComments,
  type FeedComment,
} from "../utils/feedApi";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

type Props = {
  visible: boolean;
  postId: string | null;
  token: string | null;
  currentUserId?: string | null;
  commentsCount: number;
  onClose: () => void;
  /** Called when comment count should change (+1 add, -1 delete). */
  onCommentsDelta: (delta: number) => void;
};

const WINDOW_H = Dimensions.get("window").height;
/** TikTok-like: tall sheet, ~top quarter stays as dimmed tap-to-dismiss area */
const SHEET_HEIGHT = Math.round(WINDOW_H * 0.74);
const TIKTOK_SEND = "#FE2C55";

const QUICK_EMOJIS = [
  "😂",
  "😭",
  "❤️",
  "🔥",
  "👏",
  "😍",
  "🙏",
  "💀",
  "😊",
  "😘",
  "💕",
  "✨",
  "⭐",
  "🎉",
];

function commentAuthorId(c: FeedComment): string | undefined {
  return c.user?.id ?? c.author_id ?? c.user_id;
}

function formatCommentAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${Math.max(1, sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return `${Math.floor(sec / 604800)}w`;
}

function commentAuthorLabel(c: FeedComment): string {
  const u = c.user;
  if (!u) return "Member";
  if (typeof u.username === "string" && u.username.trim()) {
    return `@${u.username.trim()}`;
  }
  return feedAuthorDisplayName(u);
}

export default function FeedCommentsModal({
  visible,
  postId,
  token,
  currentUserId,
  commentsCount,
  onClose,
  onCommentsDelta,
}: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const me = profile?.userProfile;

  const [comments, setComments] = useState<FeedComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState("");
  const loadingRef = useRef(false);
  const closingRef = useRef(false);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(WINDOW_H)).current;

  const resetLocal = useCallback(() => {
    setComments([]);
    setCursor(null);
    setDraft("");
    setLoading(false);
    setLoadingMore(false);
    loadingRef.current = false;
  }, []);

  useEffect(() => {
    if (!visible || !postId || !token) return;

    resetLocal();
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const page = await fetchFeedPostComments(token, postId, {
          limit: 30,
        });
        if (cancelled) return;
        setComments(page.comments);
        setCursor(page.next_cursor);
      } catch {
        if (!cancelled) setComments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, postId, token, resetLocal]);

  const loadMore = useCallback(async () => {
    if (!token || !postId || !cursor || loadingMore || loadingRef.current)
      return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchFeedPostComments(token, postId, {
        limit: 30,
        cursor,
      });
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const next = [...prev];
        for (const c of page.comments) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            next.push(c);
          }
        }
        return next;
      });
      setCursor(page.next_cursor);
    } catch {
      /* ignore */
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [token, postId, cursor, loadingMore]);

  const submit = useCallback(async () => {
    if (!token || !postId) return;
    const t = draft.trim();
    if (!t.length) return;
    if (t.length > MAX_FEED_COMMENT_LENGTH) {
      Alert.alert(
        "Too long",
        `Comments are limited to ${MAX_FEED_COMMENT_LENGTH} characters.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await createFeedComment(token, postId, t);
      if (created) {
        setComments((prev) => {
          if (prev.some((c) => c.id === created.id)) return prev;
          return [created, ...prev];
        });
        setDraft("");
        onCommentsDelta(1);
      }
    } catch (e) {
      Alert.alert(
        "Couldn't comment",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [token, postId, draft, onCommentsDelta]);

  const confirmDelete = useCallback(
    (comment: FeedComment) => {
      if (!token) return;
      Alert.alert("Delete comment?", undefined, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteFeedComment(token, comment.id);
                setComments((prev) => prev.filter((c) => c.id !== comment.id));
                onCommentsDelta(-1);
              } catch (e) {
                Alert.alert(
                  "Error",
                  e instanceof Error ? e.message : "Could not delete.",
                );
              }
            })();
          },
        },
      ]);
    },
    [token, onCommentsDelta],
  );

  const onSortPress = useCallback(() => {
    Alert.alert("Comments", "Showing newest first.");
  }, []);

  const mePhoto =
    typeof me?.profile_photo === "string" && me.profile_photo.trim()
      ? me.profile_photo.trim()
      : typeof me?.avatar === "string" && me.avatar.trim()
        ? me.avatar.trim()
        : "";
  const meAvatarUser = me
    ? {
        id: me.id,
        first_name: me.first_name,
        last_name: me.last_name,
        username: me.username,
        name: [me.first_name, me.last_name].filter(Boolean).join(" ") || "You",
      }
    : { id: "", name: "You" };
  const meInitials = getUserInitials(meAvatarUser);
  const meBg = getUserAvatarColor(meAvatarUser);

  const countLabel = `${commentsCount} ${commentsCount === 1 ? "comment" : "comments"}`;
  const canSend = draft.trim().length > 0 && !submitting && !!token;

  const sheetBottomPad = Math.max(insets.bottom, 8);
  const slidePx = SHEET_HEIGHT + sheetBottomPad;

  useEffect(() => {
    if (!(visible && postId)) return;
    closingRef.current = false;
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(slidePx);

    const enter = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    enter.start();
    return () => enter.stop();
  }, [visible, postId, slidePx, backdropOpacity, sheetTranslateY]);

  const handleDismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    const exit = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: slidePx,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    exit.start(({ finished }) => {
      closingRef.current = false;
      if (finished) onClose();
    });
  }, [onClose, slidePx, backdropOpacity, sheetTranslateY]);

  return (
    <Modal
      visible={visible && !!postId}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlayRoot}>
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFillObject, { opacity: backdropOpacity }]}
        >
          <Pressable
            style={styles.backdrop}
            onPress={handleDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close comments"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheetAnimatedWrap,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={0}
            style={[
              styles.kavSheet,
              {
                height: slidePx,
                paddingBottom: sheetBottomPad,
              },
            ]}
          >
          <View style={styles.sheetInner}>
            <View style={styles.sheetGrabberWrap} pointerEvents="none">
              <View style={styles.sheetGrabber} />
            </View>

            <View style={styles.header}>
              <View style={styles.headerSide} />
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {countLabel}
                </Text>
                <TouchableOpacity
                  onPress={onSortPress}
                  hitSlop={10}
                  accessibilityLabel="Comment sort"
                >
                  <ListFilter size={20} color="#333" strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.headerSide}
                onPress={handleDismiss}
                hitSlop={12}
                accessibilityLabel="Close comments"
              >
                <X size={24} color="#111" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={TIKTOK_SEND} />
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => item.id}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const uid = commentAuthorId(item);
                  const mine = uid && currentUserId && uid === currentUserId;
                  const label = commentAuthorLabel(item);
                  const photo =
                    typeof item.user?.profile_photo === "string" &&
                    item.user.profile_photo.trim()
                      ? item.user.profile_photo.trim()
                      : "";
                  const avatarUser = item.user
                    ? {
                        id: item.user.id,
                        first_name: item.user.first_name ?? undefined,
                        last_name: item.user.last_name ?? undefined,
                        username: item.user.username ?? undefined,
                        name: label,
                      }
                    : { id: uid ?? "", name: label };
                  const initials = getUserInitials(avatarUser);
                  const bg = getUserAvatarColor(avatarUser);
                  const age = formatCommentAge(item.created_at);

                  return (
                    <Pressable
                      style={styles.commentRow}
                      onLongPress={() => {
                        if (mine) confirmDelete(item);
                      }}
                      delayLongPress={450}
                    >
                      {photo ? (
                        <Image source={{ uri: photo }} style={styles.cAvatar} />
                      ) : (
                        <View style={[styles.cAvatarFb, { backgroundColor: bg }]}>
                          <Text style={styles.cAvatarTx}>{initials}</Text>
                        </View>
                      )}
                      <View style={styles.cMiddle}>
                        <Text style={styles.cName}>{label}</Text>
                        <Text style={styles.cText}>{item.content}</Text>
                        <View style={styles.cMetaRow}>
                          {age ? (
                            <Text style={styles.cMetaTime}>{age}</Text>
                          ) : null}
                          <TouchableOpacity hitSlop={8} activeOpacity={0.6}>
                            <Text style={styles.cReply}>Reply</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={styles.cActions}>
                        <TouchableOpacity style={styles.cActionBtn} hitSlop={8} activeOpacity={0.6}>
                          <Heart
                            size={20}
                            color="#8a8a8a"
                            strokeWidth={2}
                            fill="transparent"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cActionBtn} hitSlop={8} activeOpacity={0.6}>
                          <ThumbsDown size={19} color="#8a8a8a" strokeWidth={2} />
                        </TouchableOpacity>
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.empty}>No comments yet.</Text>
                }
                onEndReached={() => void loadMore()}
                onEndReachedThreshold={0.35}
                ListFooterComponent={
                  loadingMore ? (
                    <ActivityIndicator style={{ paddingVertical: 14 }} />
                  ) : null
                }
              />
            )}

            <View style={styles.composeSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.emojiStrip}
              >
                {QUICK_EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={styles.emojiChip}
                    onPress={() => setDraft((d) => d + e)}
                  >
                    <Text style={styles.emojiChipText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.composeRow}>
                {mePhoto ? (
                  <Image source={{ uri: mePhoto }} style={styles.meAvatar} />
                ) : (
                  <View style={[styles.meAvatarFb, { backgroundColor: meBg }]}>
                    <Text style={styles.meAvatarTx}>{meInitials}</Text>
                  </View>
                )}

                <View style={styles.inputShell}>
                  <TextInput
                    style={styles.input}
                    placeholder="Add comment..."
                    placeholderTextColor="#9aa0a6"
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    maxLength={MAX_FEED_COMMENT_LENGTH}
                    editable={!submitting && !!token}
                  />
                  <View style={styles.inputIcons}>
                    <TouchableOpacity hitSlop={8} activeOpacity={0.6}>
                      <ImageIcon size={22} color="#8e8e93" strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={8} activeOpacity={0.6}>
                      <Smile size={22} color="#8e8e93" strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={8} activeOpacity={0.6}>
                      <AtSign size={22} color="#8e8e93" strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.sendCircle, !canSend && styles.sendCircleOff]}
                  disabled={!canSend}
                  onPress={() => void submit()}
                  accessibilityLabel="Send comment"
                >
                  <ArrowUp size={22} color="#fff" strokeWidth={2.6} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetAnimatedWrap: {
    width: "100%",
  },
  kavSheet: {
    width: "100%",
  },
  sheetInner: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  sheetGrabberWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  sheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#dcdcdc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ebebeb",
  },
  headerSide: {
    width: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: "#111",
    maxWidth: "82%",
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 48,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
    flexGrow: 1,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
    gap: 10,
  },
  cAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eee",
  },
  cAvatarFb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cAvatarTx: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 12,
    color: Colors.dark,
  },
  cMiddle: {
    flex: 1,
    minWidth: 0,
  },
  cName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#111",
    marginBottom: 4,
  },
  cText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#222",
    lineHeight: 21,
  },
  cMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 8,
  },
  cMetaTime: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#8e8e93",
  },
  cReply: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#8e8e93",
  },
  cActions: {
    alignItems: "center",
    gap: 14,
    paddingTop: 2,
    paddingLeft: 2,
  },
  cActionBtn: {
    paddingVertical: 2,
  },
  empty: {
    textAlign: "center",
    marginTop: 56,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#9aa0a6",
  },
  composeSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ebebeb",
    backgroundColor: "#fff",
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  emojiStrip: {
    paddingBottom: 10,
    alignItems: "center",
    flexDirection: "row",
  },
  emojiChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    borderRadius: 999,
    backgroundColor: "#f3f3f5",
  },
  emojiChipText: {
    fontSize: 22,
  },
  composeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingBottom: 4,
  },
  meAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eee",
    marginBottom: 6,
  },
  meAvatarFb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  meAvatarTx: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 12,
    color: Colors.dark,
  },
  inputShell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f3f5",
    borderRadius: 22,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: Platform.OS === "ios" ? 8 : 4,
    minHeight: 44,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 28,
    maxHeight: 96,
    paddingVertical: 4,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#111",
  },
  inputIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sendCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TIKTOK_SEND,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  sendCircleOff: {
    opacity: 0.38,
  },
});
