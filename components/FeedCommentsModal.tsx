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
  Check,
  ListFilter,
  X,
} from "lucide-react-native";
import CommentHeart from "./CommentHeart";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import type { RootStackParamList } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import {
  MAX_FEED_COMMENT_LENGTH,
  createFeedComment,
  deleteFeedComment,
  feedAuthorDisplayName,
  fetchFeedPostComments,
  fetchFeedPostLikers,
  likeFeedComment,
  unlikeFeedComment,
  type FeedAuthor,
  type FeedComment,
} from "../utils/feedApi";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import ReportConfirmModal from "./ReportConfirmModal";
import SwipeToReplyRow from "./SwipeToReplyRow";

type Props = {
  visible: boolean;
  postId: string | null;
  token: string | null;
  currentUserId?: string | null;
  commentsCount: number;
  onClose: () => void;
  /** Called when comment count should change (+1 add, -1 delete). */
  onCommentsDelta: (delta: number) => void;
  /** When set, the modal scrolls the matching comment into view once the
   * first page loads and tints it with the brand accent so the user can
   * immediately see which row the notification referred to. */
  highlightCommentId?: string | null;
};

const WINDOW_H = Dimensions.get("window").height;
const WINDOW_W = Dimensions.get("window").width;
/** TikTok-like: tall sheet, ~top quarter stays as dimmed tap-to-dismiss area */
const SHEET_HEIGHT = Math.round(WINDOW_H * 0.74);

/** Drag down by at least this many px to consider a slow dismiss. */
const DISMISS_DRAG_DISTANCE = 110;
/** Drag faster than this (px/ms) downward to flick-dismiss at any distance > 12px. */
const DISMISS_FLICK_VELOCITY = 0.7;
/** Min downward distance for a flick to count (rejects accidental jitters). */
const DISMISS_FLICK_MIN_DISTANCE = 12;


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

type CommentSort = "newest" | "top";

/** Roots ordered by `sort` (newest first, or most liked first with newest as
 * the tie-break); replies under a parent stay oldest-first (conversation flow). */
function flattenCommentThreads(
  comments: FeedComment[],
  sort: CommentSort = "newest",
): CommentThreadRow[] {
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

  const topRoots = (a: FeedComment, b: FeedComment) =>
    (b.like_count ?? 0) - (a.like_count ?? 0) || descCreated(a, b);

  for (const [pid, arr] of children) {
    arr.sort(
      pid === null ? (sort === "top" ? topRoots : descCreated) : ascCreated,
    );
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
  highlightCommentId,
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
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
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
  /** Horizontal offset, used for the swipe-right-to-dismiss gesture. */
  const sheetTranslateX = useRef(new Animated.Value(0)).current;
  /** Which way the current drag is going once it's been decided. */
  const dragModeRef = useRef<"y" | "x" | null>(null);
  const dragBaseYRef = useRef(0);
  const dragBaseXRef = useRef(0);
  /** True while the touch began inside the composer (emoji strip scrolls
   * horizontally there, so a sideways swipe must not dismiss the sheet). */
  const touchInComposerRef = useRef(false);
  /** True while the touch began on a comment row (leftward swipe there = reply). */
  const touchOnCommentRef = useRef(false);
  /** While the keyboard is up, swipes must dismiss the keyboard, not the sheet. */
  const keyboardOpenRef = useRef(false);
  const [listScrollEnabled, setListScrollEnabled] = useState(true);
  /** True while the user is on a profile opened from a comment. The sheet is
   * hidden but its state (comments, draft, scroll spot) is kept, and it
   * re-opens when this screen regains focus. */
  const [suspended, setSuspended] = useState(false);
  const restoreOffsetRef = useRef(0);

  /** Begin replying to a comment and bring the keyboard up. Focus is retried
   * once because the first attempt can land before the list re-renders. */
  const startReplyTo = (c: any) => {
    setReplyTo(c);
    setTimeout(() => inputRef.current?.focus(), 40);
    setTimeout(() => {
      if (!inputRef.current?.isFocused?.()) inputRef.current?.focus();
    }, 250);
  };
  const inputRef = useRef<any>(null);
  useEffect(() => {
    const showEv = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEv = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(showEv, () => {
      keyboardOpenRef.current = true;
    });
    const b = Keyboard.addListener(hideEv, () => {
      keyboardOpenRef.current = false;
    });
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  /** Live scroll offset of the comments list; used to gate the drag-to-dismiss
   * gesture so users can still scroll long threads without dismissing. */
  const listScrollYRef = useRef(0);
  /** Snapshot of `sheetTranslateY` at the moment a drag begins. */
  const dragStartTranslateRef = useRef(0);
  /** Imperative handle to the comments FlatList, used to scroll a
   * notification-targeted comment into view once the first page loads. */
  const listRef = useRef<FlatList<CommentThreadRow>>(null);
  /**
   * 1 → fully glowing, 0 → no tint. Drives a brief pulse-in animation when
   * a `highlightCommentId` row is targeted, then decays to a softer
   * persistent tint so the row stays visually flagged without being
   * distracting after the first second.
   */
  const highlightAnim = useRef(new Animated.Value(0)).current;
  /** Tracks whether we've already scrolled-to / pulsed the current target,
   * so a re-render of `threadRows` doesn't keep re-firing the animation. */
  const highlightedScrolledForIdRef = useRef<string | null>(null);

  const resetLocal = useCallback(() => {
    setComments([]);
    setCursor(null);
    setDraft("");
    setReplyTo(null);
    setSortMenuOpen(false);
    setSortMode("newest");
    mentionLoadedForRef.current = null;
    setMentionPool({ friends: [], likers: [] });
    setLoading(false);
    setLoadingMore(false);
    loadingRef.current = false;
    highlightedScrolledForIdRef.current = null;
    highlightAnim.setValue(0);
  }, [highlightAnim]);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      setSuspended(false);
      restoreOffsetRef.current = 0;
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

  // ── @mentions ────────────────────────────────────────────────────────
  // Typing "@" (or tapping the @ button) opens a list of people to mention:
  // the viewer's friends first, then other commenters, then other likers.
  const [mentionPool, setMentionPool] = useState<{
    friends: FeedAuthor[];
    likers: FeedAuthor[];
  }>({ friends: [], likers: [] });
  const [mentionLoading, setMentionLoading] = useState(false);
  const mentionLoadedForRef = useRef<string | null>(null);

  const mentionMatch = /(?:^|\s)@([A-Za-z0-9_.]*)$/.exec(draft);
  const mentionQuery = mentionMatch ? mentionMatch[1] : null;

  const ensureMentionPool = useCallback(async () => {
    if (!token || !postId || mentionLoadedForRef.current === postId) return;
    mentionLoadedForRef.current = postId;
    setMentionLoading(true);
    try {
      const [friendsRes, likersRes] = await Promise.allSettled([
        currentUserId
          ? fetch(
              `${API_BASE_URL}/api/v1/users/${encodeURIComponent(currentUserId)}/friends`,
              { headers: { Authorization: `Bearer ${token}` } },
            ).then((r) => r.json().catch(() => null))
          : Promise.resolve(null),
        fetchFeedPostLikers(token, postId, { limit: 100 }),
      ]);
      const friends: FeedAuthor[] =
        friendsRes.status === "fulfilled" &&
        Array.isArray(friendsRes.value?.users)
          ? friendsRes.value.users
          : [];
      const likers: FeedAuthor[] =
        likersRes.status === "fulfilled"
          ? likersRes.value.likers
              .map((l) => l.user)
              .filter((u): u is FeedAuthor => Boolean(u))
          : [];
      setMentionPool({ friends, likers });
    } finally {
      setMentionLoading(false);
    }
  }, [token, postId, currentUserId]);

  // Load the pool the first time a mention is started on this post.
  useEffect(() => {
    if (mentionQuery !== null) void ensureMentionPool();
  }, [mentionQuery, ensureMentionPool]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [] as FeedAuthor[];
    const commenters = comments
      .map((c) => c.user)
      .filter((u): u is FeedAuthor => Boolean(u));
    const seen = new Set<string>();
    const ordered: FeedAuthor[] = [];
    for (const u of [
      ...mentionPool.friends,
      ...commenters,
      ...mentionPool.likers,
    ]) {
      if (!u?.id || !u.username || u.id === currentUserId || seen.has(u.id)) {
        continue;
      }
      seen.add(u.id);
      ordered.push(u);
    }
    const q = mentionQuery.toLowerCase();
    if (!q) return ordered;
    return ordered.filter((u) => {
      const hay = `${feedAuthorDisplayName(u)} ${u.username ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [mentionQuery, mentionPool, comments, currentUserId]);

  const pickMention = useCallback((u: FeedAuthor) => {
    const handle = (u.username ?? "").replace(/^@/, "");
    if (!handle) return;
    setDraft((d) => d.replace(/@([A-Za-z0-9_.]*)$/, `@${handle} `));
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const onAtPress = useCallback(() => {
    setDraft((d) => (d && !/\s$/.test(d) ? `${d} @` : `${d}@`));
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const [sortMode, setSortMode] = useState<CommentSort>("newest");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const threadRows = useMemo(
    () => flattenCommentThreads(comments, sortMode),
    [comments, sortMode],
  );

  /**
   * When the modal is opened with a `highlightCommentId` (e.g. coming from
   * a "liked your comment" / "replied to your comment" notification),
   * scroll that comment into view and run a brief accent pulse so the user
   * can immediately spot the row the notification referred to.
   *
   * The pulse value drives a tinted background on the matching row only
   * (see the renderItem block below). It animates 0 → 1 quickly, holds for
   * 1200ms, then fades back to 0. The scroll position is left where it is.
   */
  useEffect(() => {
    if (!visible || loading) return;
    const targetId = highlightCommentId?.trim();
    if (!targetId) return;
    if (highlightedScrolledForIdRef.current === targetId) return;

    const index = threadRows.findIndex((row) => row.comment.id === targetId);
    if (index === -1) return;

    highlightedScrolledForIdRef.current = targetId;

    // Give the list one frame to lay out before requesting a scroll —
    // `scrollToIndex` can no-op on a list that hasn't measured its rows
    // yet on first render.
    const scrollHandle = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.3,
        });
      } catch {
        // Rare measurement race: ignore, the row is still highlighted.
      }
    }, 80);

    highlightAnim.setValue(0);
    Animated.sequence([
      Animated.timing(highlightAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      // Hold the highlight for 1200ms, then fade it away completely.
      Animated.delay(1200),
      Animated.timing(highlightAnim, {
        toValue: 0,
        duration: 700,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();

    return () => clearTimeout(scrollHandle);
  }, [highlightCommentId, threadRows, visible, loading, highlightAnim]);

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

  const confirmReportComment = useCallback(
    (comment: FeedComment) => {
      if (!token) return;
      setReportCommentId(comment.id);
    },
    [token],
  );

  const handleCommentLongPress = useCallback(
    (comment: FeedComment, isMine: boolean) => {
      if (isMine) {
        confirmDelete(comment);
      } else if (token) {
        confirmReportComment(comment);
      }
    },
    [confirmDelete, confirmReportComment, token],
  );

  const onSortPress = useCallback(() => {
    Keyboard.dismiss();
    setSortMenuOpen((open) => !open);
  }, []);

  const chooseSort = useCallback((mode: CommentSort) => {
    setSortMode(mode);
    setSortMenuOpen(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
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
      // Don't close: hide the sheet and bring it back (same scroll spot)
      // when the user returns from the profile.
      restoreOffsetRef.current = listScrollYRef.current;
      Keyboard.dismiss();
      setSuspended(true);
      navigation.navigate("PublicProfile", { userId: id });
    },
    [navigation],
  );

  useEffect(() => {
    if (!suspended) return;
    const unsub = navigation.addListener("focus", () => setSuspended(false));
    return unsub;
  }, [suspended, navigation]);

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
    if (!(visible && postId) || suspended) return;
    closingRef.current = false;
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(slidePx);
    sheetTranslateX.setValue(0);

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
  }, [visible, postId, suspended, slidePx, backdropOpacity, sheetTranslateY, sheetTranslateX]);

  /** Animate the sheet closed. `flickVelocity` is the user's release velocity
   * (px/ms downward) — when present we shorten the close animation so it
   * feels like a continuation of the user's swipe rather than a fresh ease. */
  const handleDismiss = useCallback(
    (flickVelocity?: number, toRight?: boolean) => {
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
        toRight
          ? Animated.timing(sheetTranslateX, {
              toValue: WINDOW_W,
              duration: 180,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            })
          : Animated.timing(sheetTranslateY, {
              toValue: slidePx,
              duration: sheetDuration,
              easing: flicked
                ? Easing.out(Easing.quad)
                : Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
      ]);

      exit.start(({ finished }) => {
        closingRef.current = false;
        if (finished) onClose();
      });
    },
    [onClose, slidePx, backdropOpacity, sheetTranslateY, sheetTranslateX],
  );

  const springBack = useCallback(() => {
    Animated.spring(sheetTranslateY, {
      toValue: 0,
      friction: 8,
      tension: 120,
      useNativeDriver: true,
    }).start();
    Animated.spring(sheetTranslateX, {
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
  }, [sheetTranslateY, sheetTranslateX, backdropOpacity]);

  const onListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      listScrollYRef.current = e.nativeEvent.contentOffset.y;
    },
    [],
  );

  const dragPanResponder = useMemo(() => {
    /** Decide (once) whether this gesture is a pull-down or a swipe-right.
     * Pull-down only counts when the list is at its top; swipe-right is
     * ignored when the touch started in the composer. Until it's decided the
     * list scrolls normally. */
    const decide = (g: { dx: number; dy: number }) => {
      if (dragModeRef.current) return dragModeRef.current;
      if (keyboardOpenRef.current) return null;
      if (
        !touchInComposerRef.current &&
        g.dy > 4 &&
        Math.abs(g.dy) > Math.abs(g.dx) &&
        listScrollYRef.current <= 0
      ) {
        dragModeRef.current = "y";
        dragBaseYRef.current = g.dy; // start from 0, no jump
        setListScrollEnabled(false);
        return "y";
      }
      if (
        Math.abs(g.dx) > 8 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.3 &&
        !touchInComposerRef.current &&
        !(touchOnCommentRef.current && g.dx < 0)
      ) {
        dragModeRef.current = "x";
        dragBaseXRef.current = g.dx;
        setListScrollEnabled(false);
        return "x";
      }
      return null;
    };

    return PanResponder.create({
      // Claim touches that land on empty space too, so the whole sheet drags
      // (the list is a native scroller and would otherwise swallow them).
      onStartShouldSetPanResponder: () =>
        !closingRef.current && !keyboardOpenRef.current,
      onMoveShouldSetPanResponderCapture: (_evt, g) => {
        if (closingRef.current) return false;
        if (dragModeRef.current) return true;
        if (keyboardOpenRef.current) return false;
        const downward =
          !touchInComposerRef.current &&
          g.dy > 4 &&
          Math.abs(g.dy) > Math.abs(g.dx) * 1.2 &&
          listScrollYRef.current <= 0;
        const rightward =
          Math.abs(g.dx) > 8 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.3 &&
          !touchInComposerRef.current &&
          !(touchOnCommentRef.current && g.dx < 0);
        return downward || rightward;
      },
      onPanResponderGrant: (_evt, g) => {
        dragModeRef.current = null;
        sheetTranslateY.stopAnimation((value) => {
          dragStartTranslateRef.current = value;
        });
        decide(g);
      },
      onPanResponderMove: (_evt, g) => {
        const mode = decide(g);
        if (mode === "y") {
          const next = Math.max(
            0,
            dragStartTranslateRef.current + (g.dy - dragBaseYRef.current),
          );
          sheetTranslateY.setValue(next);
          backdropOpacity.setValue(Math.max(0, 1 - next / slidePx));
        } else if (mode === "x") {
          // A sideways swipe (either direction) pulls the sheet DOWN.
          const next = Math.abs(g.dx - dragBaseXRef.current);
          sheetTranslateY.setValue(next);
          backdropOpacity.setValue(Math.max(0, 1 - next / slidePx));
        }
      },
      onPanResponderRelease: (_evt, g) => {
        const mode = dragModeRef.current;
        dragModeRef.current = null;
        setListScrollEnabled(true);
        if (mode === "y") {
          const distance = g.dy - dragBaseYRef.current;
          const velocity = g.vy;
          const flick =
            velocity > DISMISS_FLICK_VELOCITY &&
            distance > DISMISS_FLICK_MIN_DISTANCE;
          if (flick || distance > DISMISS_DRAG_DISTANCE) {
            handleDismiss(flick ? velocity : undefined);
          } else {
            springBack();
          }
        } else if (mode === "x") {
          const distance = Math.abs(g.dx - dragBaseXRef.current);
          if (distance > 90 || (Math.abs(g.vx) > 0.6 && distance > 20)) {
            handleDismiss(Math.abs(g.vx));
          } else {
            springBack();
          }
        }
      },
      onPanResponderTerminate: () => {
        dragModeRef.current = null;
        setListScrollEnabled(true);
        springBack();
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [
    sheetTranslateY,
    sheetTranslateX,
    backdropOpacity,
    slidePx,
    handleDismiss,
    springBack,
  ]);

  return (
    <>
    <Modal
      visible={visible && !!postId && !suspended}
      transparent
      animationType="none"
      onRequestClose={() => handleDismiss()}
    >
      <View style={styles.overlayRoot}>
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}
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
            {
              transform: [
                { translateY: sheetTranslateY },
                { translateX: sheetTranslateX },
              ],
            },
          ]}
          onTouchStartCapture={() => {
            touchInComposerRef.current = false;
            touchOnCommentRef.current = false;
          }}
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

              {sortMenuOpen ? (
                <>
                  <Pressable
                    style={styles.sortMenuScrim}
                    onPress={() => setSortMenuOpen(false)}
                    accessibilityLabel="Close sort menu"
                  />
                  <View style={styles.sortMenu}>
                    {(
                      [
                        { key: "newest", label: "Newest" },
                        { key: "top", label: "Most liked" },
                      ] as { key: CommentSort; label: string }[]
                    ).map((opt, i) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[
                          styles.sortMenuRow,
                          i === 0 && styles.sortMenuRowFirst,
                        ]}
                        activeOpacity={0.6}
                        onPress={() => chooseSort(opt.key)}
                      >
                        <Text
                          style={[
                            styles.sortMenuLabel,
                            sortMode === opt.key && styles.sortMenuLabelOn,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {sortMode === opt.key ? (
                          <Check
                            size={18}
                            color={Colors.primary}
                            strokeWidth={2.6}
                          />
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={Colors.accent} />
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={threadRows}
                  keyExtractor={(row) => row.comment.id}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  // Native spring at the top when you fling up to it. It is
                  // frozen only while the sheet itself is being dragged.
                  bounces
                  scrollEnabled={listScrollEnabled}
                  onScroll={onListScroll}
                  contentOffset={{ x: 0, y: restoreOffsetRef.current }}
                  onContentSizeChange={() => {
                    const y = restoreOffsetRef.current;
                    if (y > 0) {
                      listRef.current?.scrollToOffset({
                        offset: y,
                        animated: false,
                      });
                      listScrollYRef.current = y;
                      restoreOffsetRef.current = 0;
                    }
                  }}
                  scrollEventThrottle={16}
                  // `scrollToIndex` can throw if the target row hasn't been
                  // measured yet (long threads, fast taps). Fall back to a
                  // best-effort `scrollToOffset` so the user still lands
                  // somewhere reasonable instead of a redbox.
                  onScrollToIndexFailed={(info) => {
                    listRef.current?.scrollToOffset({
                      offset: Math.max(0, info.averageItemLength * info.index),
                      animated: true,
                    });
                  }}
                  renderItem={({ item: row }) => {
                    const item = row.comment;
                    const depth = row.depth;
                    const isHighlighted =
                      !!highlightCommentId &&
                      item.id === highlightCommentId;
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

                    // For the targeted row, drive the background tint from
                    // the highlight pulse value so the row briefly glows
                    // accent-orange when the modal lands on it, then settles
                    // to a softer persistent tint. Non-target rows skip the
                    // Animated wrapper to avoid unnecessary re-renders.
                    const highlightStyle = isHighlighted
                      ? {
                          backgroundColor: highlightAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [
                              "rgba(255, 153, 0, 0)",
                              "rgba(255, 153, 0, 0.18)",
                            ],
                          }),
                        }
                      : null;

                    return (
                      <Animated.View
                        style={[
                          styles.threadRowWrap,
                          depth > 0 && {
                            marginLeft: Math.min(depth * 12, 60),
                          },
                          isHighlighted && styles.highlightedRowBase,
                          highlightStyle,
                        ]}
                      >
                        <SwipeToReplyRow
                          onSwipeActiveChange={(active) =>
                            setListScrollEnabled(!active)
                          }
                          onTouchStart={() => {
                            touchOnCommentRef.current = true;
                          }}
                          onReply={() => {
                            startReplyTo(item);
                          }}
                        >
                        <View
                          style={depth > 0 ? styles.threadReplyBranch : undefined}
                        >
                        <Pressable
                          style={styles.commentRow}
                          onPress={() => handleCommentRowPress(item)}
                          onLongPress={() => {
                            handleCommentLongPress(item, !!mine);
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
                                onPress={() => startReplyTo(item)}
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
                        </SwipeToReplyRow>
                      </Animated.View>
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

              <View
                style={styles.composeSection}
                onTouchStart={() => {
                  touchInComposerRef.current = true;
                }}
              >
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

                {mentionQuery !== null ? (
                  <View style={styles.mentionList}>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      style={styles.mentionScroll}
                    >
                      {mentionCandidates.length === 0 ? (
                        <Text style={styles.mentionEmpty}>
                          {mentionLoading ? "Loading…" : "No matches"}
                        </Text>
                      ) : (
                        mentionCandidates.map((u) => {
                          const name = feedAuthorDisplayName(u);
                          const avatarUser = {
                            id: u.id,
                            first_name: u.first_name ?? undefined,
                            last_name: u.last_name ?? undefined,
                            username: u.username ?? undefined,
                            name,
                          };
                          const photo = u.profile_photo?.trim()
                            ? encodeURI(u.profile_photo.trim())
                            : "";
                          return (
                            <TouchableOpacity
                              key={u.id}
                              style={styles.mentionRow}
                              activeOpacity={0.6}
                              onPress={() => pickMention(u)}
                            >
                              {photo ? (
                                <Image
                                  source={{ uri: photo }}
                                  style={styles.mentionAvatar}
                                />
                              ) : (
                                <View
                                  style={[
                                    styles.mentionAvatar,
                                    styles.mentionAvatarFb,
                                    { backgroundColor: getUserAvatarColor(avatarUser) },
                                  ]}
                                >
                                  <Text style={styles.mentionAvatarTx}>
                                    {getUserInitials(avatarUser)}
                                  </Text>
                                </View>
                              )}
                              <View style={styles.mentionText}>
                                <Text style={styles.mentionName} numberOfLines={1}>
                                  {name}
                                </Text>
                                <Text style={styles.mentionHandle} numberOfLines={1}>
                                  @{(u.username ?? "").replace(/^@/, "")}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                ) : null}


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
                      ref={inputRef}
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
                      <TouchableOpacity
                        hitSlop={8}
                        activeOpacity={0.6}
                        onPress={onAtPress}
                        accessibilityLabel="Mention someone"
                      >
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

    <ReportConfirmModal
      visible={reportCommentId !== null}
      onClose={() => setReportCommentId(null)}
      contentType="comment"
      contentId={reportCommentId ?? ""}
      contentLabel="Comment"
    />
    </>
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
  sortMenuScrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
  sortMenu: {
    position: "absolute",
    top: 64,
    alignSelf: "center",
    zIndex: 11,
    minWidth: 190,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dcdcdc",
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  sortMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortMenuRowFirst: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ebebeb",
  },
  sortMenuLabel: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 15,
    color: "#333",
  },
  sortMenuLabelOn: {
    fontFamily: Fonts.gabarito.semiBold,
    color: Colors.primary,
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
  // Static portion of the notification-highlighted row treatment. The
  // animated background colour + left border colour are applied via the
  // interpolations in renderItem so only the targeted row is animated.
  highlightedRowBase: {
    borderRadius: 10,
    marginVertical: 2,
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
  mentionList: {
    marginBottom: 8,
    maxHeight: 196,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#dcdcdc",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  mentionScroll: {
    flexGrow: 0,
  },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  mentionAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  mentionAvatarFb: {
    alignItems: "center",
    justifyContent: "center",
  },
  mentionAvatarTx: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 13,
    color: "#fff",
  },
  mentionText: {
    flex: 1,
    minWidth: 0,
  },
  mentionName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#111",
  },
  mentionHandle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#8a8f96",
  },
  mentionEmpty: {
    paddingVertical: 14,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#8a8f96",
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
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  sendCircleOff: {
    opacity: 0.38,
  },
});
