import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Flag, Send, ShieldBan, Trash2 } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Button from "./Button";
import ReportConfirmModal from "./ReportConfirmModal";

export type FeedPostOptionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  postId: string;
  authorId?: string;
  onShare: () => void;
  onDeleteConfirmed: () => Promise<void>;
  onReportConfirmed: () => Promise<void>;
  onShareWithFriends?: () => void;
  authorUsername?: string | null;
  onBlockUser?: () => void;
  onBlockComplete?: () => void;
  /** Window coordinates of the tap that opened the menu (from the press
   * event's pageX / pageY). The popup anchors next to it. */
  anchor?: { x: number; y: number } | null;
};

const CARD_WIDTH = 252;
const CARD_PAD = 16;
const ROW_HEIGHT = 54;

const DESTRUCTIVE = "#DC3545";

function OptionRow(props: {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  destructive?: boolean;
  isLast?: boolean;
  onPress: () => void;
}) {
  const Icon = props.icon;
  const fg = props.destructive ? DESTRUCTIVE : Colors.dark;
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.optionRow,
        !props.isLast && styles.optionRowDivider,
        pressed && styles.optionRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={props.label}
    >
      <Icon size={20} color={fg} strokeWidth={2.2} />
      <Text
        style={[styles.optionLabel, props.destructive && styles.optionLabelDestructive]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export default function FeedPostOptionsSheet({
  visible,
  onClose,
  isOwner,
  postId,
  authorId,
  onShare,
  onShareWithFriends,
  onDeleteConfirmed,
  onReportConfirmed,
  authorUsername,
  onBlockUser,
  onBlockComplete,
  anchor,
}: FeedPostOptionsSheetProps) {
  const { width: windowW, height: windowH } = useWindowDimensions();
  const overlay = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const pendingAction = useRef<(() => void) | null>(null);

  // Spring the popup in whenever it opens.
  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    overlay.setValue(0);
    cardAnim.setValue(0);
    const raf = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(overlay, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(cardAnim, {
          toValue: 1,
          friction: 7,
          tension: 78,
          useNativeDriver: true,
        }),
      ]).start();
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, overlay, cardAnim]);

  /** Animate the popup out, then tell the parent to close (and, for actions
   * that open another modal, run them once this one is gone). */
  const animateClose = useCallback(
    (then: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Animated.parallel([
        Animated.timing(overlay, {
          toValue: 0,
          duration: 170,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardAnim, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        closingRef.current = false;
        then();
      });
    },
    [overlay, cardAnim],
  );

  const closeWithAction = useCallback(
    (action: () => void) => {
      animateClose(() => {
        pendingAction.current = action;
        onClose();
        if (Platform.OS === "android") {
          setTimeout(() => {
            const a = pendingAction.current;
            pendingAction.current = null;
            a?.();
          }, 350);
        }
      });
    },
    [animateClose, onClose],
  );

  const handleClose = useCallback(() => {
    animateClose(() => {
      pendingAction.current = null;
      onClose();
    });
  }, [animateClose, onClose]);

  const handleDismiss = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) action();
  }, []);

  const { token } = useAuth();

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const confirmDelete = useCallback(() => {
    closeWithAction(() => {
      setShowDeleteModal(true);
    });
  }, [closeWithAction]);

  const handleDelete = useCallback(async () => {
    setDeleteLoading(true);
    try {
      await onDeleteConfirmed();
      setShowDeleteModal(false);
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not delete post.",
      );
    } finally {
      setDeleteLoading(false);
    }
  }, [onDeleteConfirmed]);

  const confirmReport = useCallback(() => {
    closeWithAction(() => {
      setShowReportModal(true);
    });
  }, [closeWithAction]);

  const runShareFriends = useCallback(() => {
    closeWithAction(() => onShareWithFriends?.());
  }, [closeWithAction, onShareWithFriends]);

  const runBlockUser = useCallback(() => {
    closeWithAction(() => setShowBlockModal(true));
  }, [closeWithAction]);

  const handleBlock = useCallback(async () => {
    if (!token || !authorId) return;
    setBlockLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/users/${authorId}/block`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        },
      );
      if (!res.ok) throw new Error("Could not block user.");
      setShowBlockModal(false);
      onBlockComplete?.();
    } catch {
      Alert.alert("Error", "Could not block user.");
    } finally {
      setBlockLoading(false);
    }
  }, [token, authorId, onBlockComplete]);

  // Popup geometry: anchored under (or, near the bottom edge, above) the tap.
  const rowCount = (onShareWithFriends ? 1 : 0) + (isOwner ? 1 : authorId ? 2 : 1);
  const cardHeightEstimate = 44 + rowCount * ROW_HEIGHT;
  const anchorX = anchor?.x ?? windowW - CARD_PAD;
  const anchorY = anchor?.y ?? 120;
  const openAbove = anchorY + 16 + cardHeightEstimate > windowH - 32;
  const cardTop = openAbove
    ? Math.max(48, anchorY - cardHeightEstimate - 16)
    : anchorY + 16;
  const cardLeft = Math.max(
    CARD_PAD,
    Math.min(anchorX + 22 - CARD_WIDTH, windowW - CARD_WIDTH - CARD_PAD),
  );
  const cardOpacity = cardAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 1, 1],
  });
  const cardScale = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });
  const cardTranslateY = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [openAbove ? 18 : -18, 0],
  });

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={handleClose}
        onDismiss={handleDismiss}
      >
        <View style={styles.modalRoot}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: overlay }]}
          >
            <BlurView
              intensity={48}
              tint="dark"
              experimentalBlurMethod={
                Platform.OS === "android" ? "dimezisBlurView" : undefined
              }
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.backdropTint} />
          </Animated.View>

          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss post options"
          />

          <Animated.View
            style={[
              styles.card,
              {
                top: cardTop,
                left: cardLeft,
                opacity: cardOpacity,
                transformOrigin: openAbove ? "bottom right" : "top right",
                transform: [
                  { translateY: cardTranslateY },
                  { scale: cardScale },
                ],
              },
            ]}
          >
            <Text style={styles.heading}>Post options</Text>
            {onShareWithFriends ? (
              <OptionRow
                icon={Send}
                label="Send to friend"
                onPress={runShareFriends}
              />
            ) : null}
            {isOwner ? (
              <OptionRow
                icon={Trash2}
                label="Delete post"
                destructive
                isLast
                onPress={confirmDelete}
              />
            ) : (
              <>
                {authorId ? (
                  <OptionRow
                    icon={ShieldBan}
                    label={
                      authorUsername ? `Block @${authorUsername}` : "Block user"
                    }
                    destructive
                    onPress={runBlockUser}
                  />
                ) : null}
                <OptionRow
                  icon={Flag}
                  label="Report"
                  destructive
                  isLast
                  onPress={confirmReport}
                />
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* Delete confirmation modal — matches community delete style */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!deleteLoading) setShowDeleteModal(false);
          }}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Delete Post?</Text>
            <Text style={styles.modalBody}>
              This will permanently remove this post for everyone. This action
              can't be undone.
            </Text>
            <View style={styles.modalActions}>
              <View style={styles.modalActionCell}>
                <Button
                  label="Keep"
                  variant="secondary"
                  fullWidth
                  onPress={() => setShowDeleteModal(false)}
                  disabled={deleteLoading}
                />
              </View>
              <View style={styles.modalActionCell}>
                <Button
                  label="Delete"
                  variant="destructive"
                  fullWidth
                  onPress={() => void handleDelete()}
                  disabled={deleteLoading}
                  loading={deleteLoading}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Block confirm modal */}
      <Modal
        visible={showBlockModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!blockLoading) setShowBlockModal(false);
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!blockLoading) setShowBlockModal(false);
          }}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              Block {authorUsername ? `@${authorUsername}` : "this user"}?
            </Text>
            <Text style={styles.modalBody}>
              They won't be able to see your content and you won't see theirs.
              You can unblock them later.
            </Text>
            <View style={styles.modalActions}>
              <View style={styles.modalActionCell}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  fullWidth
                  onPress={() => setShowBlockModal(false)}
                  disabled={blockLoading}
                />
              </View>
              <View style={styles.modalActionCell}>
                <Button
                  label="Block"
                  variant="destructive"
                  fullWidth
                  onPress={() => void handleBlock()}
                  disabled={blockLoading}
                  loading={blockLoading}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ReportConfirmModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        contentType="post"
        contentId={postId}
        contentLabel="Post"
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdropTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  card: {
    position: "absolute",
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingTop: 16,
    paddingBottom: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  heading: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#9AA0A6",
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: ROW_HEIGHT,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
  },
  optionRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E6E6",
  },
  optionRowPressed: {
    backgroundColor: "#EEF2F6",
  },
  optionLabel: {
    flex: 1,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  optionLabelDestructive: {
    color: DESTRUCTIVE,
    fontFamily: Fonts.gabarito.semiBold,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.dark,
    textAlign: "center",
  },
  modalBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalActionCell: {
    flex: 1,
  },
});
