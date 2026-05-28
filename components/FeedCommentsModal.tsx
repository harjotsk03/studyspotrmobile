import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  ArrowUp,
  AtSign,
  Image as ImageIcon,
  ListFilter,
  Smile,
  X,
} from "lucide-react-native";
import CommentHeart from "./CommentHeart";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { RootStackParamList } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import {
  MAX_FEED_COMMENT_LENGTH,
  createFeedComment,
  deleteFeedComment,
  feedAuthorDisplayName,
  fetchFeedPostComments,
  likeFeedComment,
  unlikeFeedComment,
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

/** Drag down by at least this many px to consider a slow dismiss. */
const DISMISS_DRAG_DISTANCE = 110;
/** Drag faster than this (px/ms) downward to flick-dismiss at any distance > 12px. */
const DISMISS_FLICK_VELOCITY = 0.7;
/** Min downward distance for a flick to count (rejects accidental jitters). */
const DISMISS_FLICK_MIN_DISTANCE = 12;

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

function commentAuthorDisplayLabel(c: FeedComment): string {
  return feedAuthorDisplayName(c.user);
}

type CommentThreadRow = {
  comment: FeedComment;
  depth: number;
};

/** Roots newest-first; replies under parent oldest-first (conversation flow). */
function flattenCommentThreads(comments: FeedComment[]): CommentThreadRow[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const children = new Map<string | null, FeedComment[]>();

  for (const c of comments) {
    let pid: string | null = c.parent_comment_id;
    if (pid && !byId.has(pid)) pid = null;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid)!.push(c);
  }

  const ascCreated = (a: FeedComment, b: FeedComment) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const descCreated = (a: FeedComment, b: FeedComment) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  for (const [pid, arr] of children) {
    arr.sort(pid === null ? descCreated : ascCreated);
  }

  const rows: CommentThreadRow[] = [];
  function walk(parentId: string | null, depth: number) {
    const list = children.get(parentId) ?? [];
    for (const c of list) {
      rows.push({ comment: c, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  return rows;
}

function formatCommentLikeCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
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
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile } = useAuth();
  const me = profile?.userProfile;

  const [comments, setComments] = useState<FeedComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const loadingRef = useRef(false);
  const closingRef = useRef(false);

  /**
   * Tracks the most recent tap on a comment row so we can recognize a
   * double-tap (Instagram-style) and toggle a like. We deliberately key by
   * comment id so tapping one row then quickly tapping a different row
   * doesn't fire a phantom like on either.
   */
  const lastCommentTapRef = useRef<{ id: string; t: number }>({
    id: "",
    t: 0,
  });
  /** Max ms between two taps to count as a double-tap. */
  const DOUBLE_TAP_WINDOW_MS = 300;

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(WINDOW_H)).current;
  /** Live scroll offset of the comments list; used to gate the drag-to-dismiss
   * gesture so users can still scroll long threads without dismissing. */
  const listScrollYRef = useRef(0);
  /** Snapshot of `sheetTranslateY` at the moment a drag begins. */
  const dragStartTranslateRef = useRef(0);

  const resetLocal = useCallback(() => {
    setComments([]);
    setCursor(null);
    setDraft("");
    setReplyTo(null);
    setLoading(false);
    setLoadingMore(false);
    loadingRef.current = false;
  }, []);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return;
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardInset(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardInset(0);

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [visible]);

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

  const threadRows = useMemo(
    () => flattenCommentThreads(comments),
    [comments],
  );

  const toggleCommentLike = useCallback(
    async (c: FeedComment) => {
      if (!token) return;
      const was = c.viewer_has_liked;
      const nextLiked = !was;
      const d = nextLiked ? 1 : -1;
      // Tactile confirmation on like — kept light so the rapid double-tap
      // path doesn't feel buzzy. We intentionally don't haptic on unlike;
      // undoing an action shouldn't feel as satisfying as taking one.
      if (nextLiked) {
        try {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {
          // Haptics unavailable on this platform — silent.
        }
      }
      setComments((prev) =>
        prev.map((x) =>
          x.id === c.id
            ? {
                ...x,
                viewer_has_liked: nextLiked,
                like_count: Math.max(0, x.like_count + d),
              }
            : x,
        ),
      );
      try {
        const updated = nextLiked
          ? await likeFeedComment(token, c.id)
          : await unlikeFeedComment(token, c.id);
        if (updated) {
          setComments((prev) =>
            prev.map((x) =>
              x.id === c.id
                ? {
                    ...x,
                    like_count: updated.like_count,
                    viewer_has_liked: updated.viewer_has_liked,
                  }
                : x,
            ),
          );
        }
      } catch {
        setComments((prev) =>
          prev.map((x) =>
            x.id === c.id
              ? {
                  ...x,
                  viewer_has_liked: was,
                  like_count: c.like_count,
                }
              : x,
          ),
        );
        Alert.alert("Couldn’t update like", "Try again.");
      }
    },
    [token],
  );

  /**
   * Detect a double-tap on a comment row and like it (Instagram-style).
   * Only ever triggers a *like* — if the comment is already liked we
   * deliberately no-op rather than unliking, so the gesture can't undo
   * itself on a fast double-tap.
   */
  const handleCommentRowPress = useCallback(
    (c: FeedComment) => {
      const now = Date.now();
      const prev = lastCommentTapRef.current;
      if (prev.id === c.id && now - prev.t < DOUBLE_TAP_WINDOW_MS) {
        lastCommentTapRef.current = { id: "", t: 0 };
        if (!c.viewer_has_liked) {
          void toggleCommentLike(c);
        }
        return;
      }
      lastCommentTapRef.current = { id: c.id, t: now };
    },
    [toggleCommentLike],
  );

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
      const parentId = replyTo?.id ?? null;
      const created = await createFeedComment(token, postId, t, {
        parentCommentId: parentId,
      });
      if (created) {
        setComments((prev) => {
          if (prev.some((x) => x.id === created.id)) return prev;
          return [created, ...prev];
        });
        setDraft("");
        setReplyTo(null);
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
  }, [token, postId, draft, replyTo, onCommentsDelta]);

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

  // Tapping the avatar or name pushes PublicProfile. We close the sheet on
  // the way out so when the user backs out of the profile screen they
  // return to a clean feed rather than the still-open comments modal.
  // Navigation goes first so the push covers the screen before the
  // dismiss animation runs visibly.
  const openCommentAuthorProfile = useCallback(
    (userId: string | undefined) => {
      const id = userId?.trim();
      if (!id) return;
      navigation.navigate("PublicProfile", { userId: id });
      onClose();
    },
    [navigation, onClose],
  );

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
  const sheetPadBottom = keyboardInset > 0 ? keyboardInset : sheetBottomPad;

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

  /** Animate the sheet closed. `flickVelocity` is the user's release velocity
   * (px/ms downward) — when present we shorten the close animation so it
   * feels like a continuation of the user's swipe rather than a fresh ease. */
  const handleDismiss = useCallback(
    (flickVelocity?: number) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Keyboard.dismiss();

      const flicked = typeof flickVelocity === "number" && flickVelocity > 0;
      const sheetDuration = flicked ? 160 : 260;
      const fadeDuration = flicked ? 140 : 200;

      const exit = Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: fadeDuration,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: slidePx,
          duration: sheetDuration,
          easing: flicked ? Easing.out(Easing.quad) : Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);

      exit.start(({ finished }) => {
        closingRef.current = false;
        if (finished) onClose();
      });
    },
    [onClose, slidePx, backdropOpacity, sheetTranslateY],
  );

  const springBack = useCallback(() => {
    Animated.spring(sheetTranslateY, {
      toValue: 0,
      friction: 8,
      tension: 120,
      useNativeDriver: true,
    }).start();
    Animated.timing(backdropOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [sheetTranslateY, backdropOpacity]);

  const onListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      listScrollYRef.current = e.nativeEvent.contentOffset.y;
    },
    [],
  );

  const dragPanResponder = useMemo(
    () =>
      PanResponder.create({
        // Only consider claiming the gesture if the user is at the top of the
        // comments list AND is dragging clearly downward. This lets the
        // FlatList handle normal vertical scrolling.
        onMoveShouldSetPanResponderCapture: (_evt, g) => {
          if (closingRef.current) return false;
          const downward = g.dy > 4;
          const verticalDominant = Math.abs(g.dy) > Math.abs(g.dx) * 1.2;
          const atTop = listScrollYRef.current <= 0;
          return downward && verticalDominant && atTop;
        },
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            dragStartTranslateRef.current = value;
          });
          // Fade backdrop slightly as the user drags so the dismiss intent
          // feels acknowledged immediately.
        },
        onPanResponderMove: (_evt, g) => {
          const next = Math.max(0, dragStartTranslateRef.current + g.dy);
          sheetTranslateY.setValue(next);
          const fade = Math.max(0, 1 - next / slidePx);
          backdropOpacity.setValue(fade);
        },
        onPanResponderRelease: (_evt, g) => {
          const distance = g.dy;
          const velocity = g.vy;
          const flick =
            velocity > DISMISS_FLICK_VELOCITY &&
            distance > DISMISS_FLICK_MIN_DISTANCE;
          const slowDismiss = distance > DISMISS_DRAG_DISTANCE;
          if (flick || slowDismiss) {
            handleDismiss(flick ? velocity : undefined);
          } else {
            springBack();
          }
        },
        onPanResponderTerminate: () => {
          springBack();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [sheetTranslateY, backdropOpacity, slidePx, handleDismiss, springBack],
  );

  return (
    <Modal
      visible={visible && !!postId}
      transparent
      animationType="none"
      onRequestClose={() => handleDismiss()}
    >
      <View style={styles.overlayRoot}>
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFillObject, { opacity: backdropOpacity }]}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => handleDismiss()}
            accessibilityRole="button"
            accessibilityLabel="Close comments"
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheetAnimatedWrap,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
          {...dragPanResponder.panHandlers}
        >
          <View style={[styles.sheetOuter, { height: slidePx }]}>
            <View
              style={[styles.sheetInner, { paddingBottom: sheetPadBottom }]}
            >
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
                  onPress={() => handleDismiss()}
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
                  data={threadRows}
                  keyExtractor={(row) => row.comment.id}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                  onScroll={onListScroll}
                  scrollEventThrottle={16}
                  renderItem={({ item: row }) => {
                    const item = row.comment;
                    const depth = row.depth;
                    const uid = commentAuthorId(item);
                    const mine = uid && currentUserId && uid === currentUserId;
                    const displayName = commentAuthorDisplayLabel(item);
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
                          name: displayName,
                        }
                      : { id: uid ?? "", name: displayName };
                    const initials = getUserInitials(avatarUser);
                    const bg = getUserAvatarColor(avatarUser);
                    const age = formatCommentAge(item.created_at);
                    const canOpenProfile = Boolean(uid);

                    return (
                      <View
                        style={[
                          styles.threadRowWrap,
                          depth > 0 && [
                            styles.threadReplyBranch,
                            { marginLeft: Math.min(depth * 12, 60) },
                          ],
                        ]}
                      >
                        <Pressable
                          style={styles.commentRow}
                          onPress={() => handleCommentRowPress(item)}
                          onLongPress={() => {
                            if (mine) confirmDelete(item);
                          }}
                          delayLongPress={450}
                        >
                          <Pressable
                            onPress={() => openCommentAuthorProfile(uid)}
                            disabled={!canOpenProfile}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={`${displayName} profile`}
                          >
                            {photo ? (
                              <Image
                                source={{ uri: photo }}
                                style={styles.cAvatar}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.cAvatarFb,
                                  { backgroundColor: bg },
                                ]}
                              >
                                <Text style={styles.cAvatarTx}>{initials}</Text>
                              </View>
                            )}
                          </Pressable>
                          <View style={styles.cMiddle}>
                            <Pressable
                              onPress={() => openCommentAuthorProfile(uid)}
                              disabled={!canOpenProfile}
                              hitSlop={{ bottom: 4 }}
                              // `Pressable` is a View; without an explicit
                              // alignSelf it stretches to fill the parent
                              // column, making the empty space to the right
                              // of the name tappable. Constrain to the text
                              // width so only the name itself opens the
                              // profile.
                              style={styles.cNamePressable}
                            >
                              <Text style={styles.cName}>{displayName}</Text>
                            </Pressable>
                            <Text style={styles.cText}>{item.content}</Text>
                            <View style={styles.cMetaRow}>
                              {age ? (
                                <Text style={styles.cMetaTime}>{age}</Text>
                              ) : null}
                              <TouchableOpacity
                                hitSlop={8}
                                activeOpacity={0.6}
                                onPress={() => setReplyTo(item)}
                              >
                                <Text style={styles.cReply}>Reply</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={styles.cLikeRail}>
                            <TouchableOpacity
                              style={styles.cLikeBtn}
                              hitSlop={8}
                              activeOpacity={0.7}
                              onPress={() => void toggleCommentLike(item)}
                            >
                              <CommentHeart
                                liked={item.viewer_has_liked}
                                size={20}
                              />
                              {item.like_count > 0 ? (
                                <Text
                                  style={[
                                    styles.cLikeCount,
                                    item.viewer_has_liked &&
                                      styles.cLikeCountActive,
                                  ]}
                                >
                                  {formatCommentLikeCount(item.like_count)}
                                </Text>
                              ) : null}
                            </TouchableOpacity>
                          </View>
                        </Pressable>
                      </View>
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
                    ) : threadRows.length > 0 && !cursor ? (
                      <Text style={styles.endOfReplies}>End of comments</Text>
                    ) : null
                  }
                />
              )}

              <View style={styles.composeSection}>
                {replyTo ? (
                  <View style={styles.replyBanner}>
                    <Text style={styles.replyBannerLabel} numberOfLines={1}>
                      Replying to{" "}
                      <Text style={styles.replyBannerName}>
                        {commentAuthorDisplayLabel(replyTo)}
                      </Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() => setReplyTo(null)}
                      hitSlop={10}
                      accessibilityLabel="Cancel reply"
                    >
                      <Text style={styles.replyBannerCancel}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

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
                    <View
                      style={[styles.meAvatarFb, { backgroundColor: meBg }]}
                    >
                      <Text style={styles.meAvatarTx}>{meInitials}</Text>
                    </View>
                  )}

                  <View style={styles.inputShell}>
                    <TextInput
                      style={styles.input}
                      placeholder={
                        replyTo
                          ? "Write a reply…"
                          : "Add comment..."
                      }
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
                    style={[
                      styles.sendCircle,
                      !canSend && styles.sendCircleOff,
                    ]}
                    disabled={!canSend}
                    onPress={() => void submit()}
                    accessibilityLabel="Send comment"
                  >
                    <ArrowUp size={22} color="#fff" strokeWidth={2.6} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
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
  sheetOuter: {
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
  threadRowWrap: {},
  threadReplyBranch: {
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#ebebeb",
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
  cNamePressable: {
    alignSelf: "flex-start",
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
  cLikeRail: {
    alignItems: "center",
    paddingTop: 2,
    minWidth: 40,
  },
  cLikeBtn: {
    alignItems: "center",
    gap: 2,
  },
  cLikeCount: {
    fontSize: 11,
    fontFamily: Fonts.gabarito.medium,
    color: "#8e8e93",
  },
  cLikeCountActive: {
    color: Colors.accent,
  },
  endOfReplies: {
    textAlign: "center",
    paddingVertical: 16,
    fontSize: 13,
    color: "#aaa",
    fontFamily: Fonts.instrument.regular,
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
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#f3f3f5",
    borderRadius: 12,
  },
  replyBannerLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.instrument.regular,
    color: "#666",
  },
  replyBannerName: {
    fontFamily: Fonts.gabarito.semiBold,
    color: "#111",
  },
  replyBannerCancel: {
    fontSize: 14,
    fontFamily: Fonts.gabarito.semiBold,
    color: Colors.primary,
    marginLeft: 10,
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
