import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Heart, X } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { RootStackParamList } from "../types/navigation";
import {
  feedAuthorDisplayName,
  fetchFeedPostLikers,
  type FeedLiker,
} from "../utils/feedApi";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

type Props = {
  visible: boolean;
  postId: string | null;
  likeCount: number;
  token: string | null;
  currentUserId?: string | null;
  onClose: () => void;
};

const WINDOW_H = Dimensions.get("window").height;
const SHEET_HEIGHT = Math.round(WINDOW_H * 0.72);

const DISMISS_DRAG_DISTANCE = 110;
const DISMISS_FLICK_VELOCITY = 0.7;
const DISMISS_FLICK_MIN_DISTANCE = 12;

export default function FeedLikersModal({
  visible,
  postId,
  likeCount,
  token,
  currentUserId,
  onClose,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [likers, setLikers] = useState<FeedLiker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(WINDOW_H)).current;
  const listScrollYRef = useRef(0);
  const dragStartTranslateRef = useRef(0);
  const closingRef = useRef(false);

  const slidePx = SHEET_HEIGHT;

  // Load likers when modal opens
  useEffect(() => {
    if (!visible || !postId || !token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLikers([]);

    void (async () => {
      try {
        const page = await fetchFeedPostLikers(token, postId, { limit: 50 });
        if (!cancelled) setLikers(page.likers);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load likes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, postId, token]);

  // Slide-in animation
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

  const handleDismiss = useCallback(
    (flickVelocity?: number) => {
      if (closingRef.current) return;
      closingRef.current = true;

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

  const dragPanResponder = useRef(
    PanResponder.create({
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
  ).current;

  const openProfile = useCallback(
    (userId: string | undefined) => {
      const id = userId?.trim();
      if (!id) return;
      navigation.navigate("PublicProfile", { userId: id });
      onClose();
    },
    [navigation, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedLiker }) => {
      const user = item.user;
      const displayName = feedAuthorDisplayName(user);
      const initialsUser = user
        ? {
            id: user.id,
            first_name: user.first_name ?? undefined,
            last_name: user.last_name ?? undefined,
            username: user.username ?? undefined,
            name: displayName,
          }
        : { id: item.user_id, name: displayName };
      const photo =
        typeof user?.profile_photo === "string" && user.profile_photo.trim()
          ? user.profile_photo.trim()
          : "";
      const color = getUserAvatarColor(initialsUser);
      const initials = getUserInitials(initialsUser);
      const isMe = item.user_id === currentUserId;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.row,
            pressed && styles.rowPressed,
          ]}
          onPress={() => openProfile(item.user_id)}
          accessibilityRole="button"
          accessibilityLabel={`View ${displayName}'s profile`}
        >
          <View style={[styles.avatar, { backgroundColor: color }]}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarLetter}>{initials}</Text>
            )}
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowName} numberOfLines={1}>
              {displayName}
              {isMe ? (
                <Text style={styles.youTag}> · You</Text>
              ) : null}
            </Text>
            {user?.username ? (
              <Text style={styles.rowUsername} numberOfLines={1}>
                @{user.username}
              </Text>
            ) : null}
          </View>
          <Heart size={16} color="#ED1C5A" fill="#ED1C5A" strokeWidth={0} />
        </Pressable>
      );
    },
    [currentUserId, openProfile],
  );

  const countLabel =
    likeCount === 1 ? "1 like" : `${likeCount} likes`;

  return (
    <Modal
      visible={visible && !!postId}
      transparent
      animationType="none"
      onRequestClose={() => handleDismiss()}
    >
      <View style={styles.overlayRoot}>
        {/* Dimmed backdrop */}
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFillObject, { opacity: backdropOpacity }]}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => handleDismiss()}
            accessibilityRole="button"
            accessibilityLabel="Close likes"
          />
        </Animated.View>

        {/* Sliding sheet */}
        <Animated.View
          style={[
            styles.sheetAnimatedWrap,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
          {...dragPanResponder.panHandlers}
        >
          <View style={[styles.sheetOuter, { height: slidePx }]}>
            <View style={styles.sheetInner}>
              {/* Grab handle */}
              <View style={styles.grabberWrap} pointerEvents="none">
                <View style={styles.grabber} />
              </View>

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerSide} />
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {countLabel}
                </Text>
                <TouchableOpacity
                  style={styles.headerSide}
                  onPress={() => handleDismiss()}
                  hitSlop={12}
                  accessibilityLabel="Close likes"
                >
                  <X size={22} color="#111" strokeWidth={2.2} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : error ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>Couldn't load likes</Text>
                  <Text style={styles.emptySub}>{error}</Text>
                </View>
              ) : likers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Heart size={44} color="#ddd" fill="#ddd" strokeWidth={0} />
                  <Text style={styles.emptyTitle}>No likes yet</Text>
                  <Text style={styles.emptySub}>
                    Be the first to like this post.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={likers}
                  keyExtractor={(item) => item.user_id}
                  renderItem={renderItem}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                  onScroll={onListScroll}
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={false}
                />
              )}
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetAnimatedWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetOuter: {
    overflow: "hidden",
  },
  sheetInner: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  grabberWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
  },
  headerSide: {
    width: 40,
    alignItems: "flex-end",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40,
  },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    textAlign: "center",
  },
  emptySub: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 32,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  rowPressed: {
    backgroundColor: "#fafafa",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
    fontSize: 16,
    color: "#fff",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  youTag: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#999",
  },
  rowUsername: {
    marginTop: 2,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
});
