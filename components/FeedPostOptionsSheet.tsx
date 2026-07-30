import { useCallback, useRef, useState, type ComponentType } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Flag, Send, Share2, ShieldBan, Trash2 } from "lucide-react-native";
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
};

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
      <Icon size={22} color={fg} strokeWidth={2.1} />
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
}: FeedPostOptionsSheetProps) {
  const insets = useSafeAreaInsets();
  const pendingAction = useRef<(() => void) | null>(null);

  const closeWithAction = useCallback(
    (action: () => void) => {
      pendingAction.current = action;
      onClose();
      if (Platform.OS === "android") {
        setTimeout(() => {
          const a = pendingAction.current;
          pendingAction.current = null;
          a?.();
        }, 350);
      }
    },
    [onClose],
  );

  const handleClose = useCallback(() => {
    pendingAction.current = null;
    onClose();
  }, [onClose]);

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

  const runShare = useCallback(() => {
    closeWithAction(() => void onShare());
  }, [closeWithAction, onShare]);

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

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
        onDismiss={handleDismiss}
      >
        <KeyboardAvoidingView
          style={[styles.sheet, { paddingTop: insets.top + 8 }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheetHeader}>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>Post options</Text>
            <View style={styles.sheetHeaderTrailing} accessibilityElementsHidden />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces
            contentContainerStyle={[
              styles.sheetBody,
              { paddingBottom: insets.bottom + 24 },
            ]}
          >
            <Text style={styles.bodyIntro}>
              {isOwner
                ? "Manage this post."
                : "Share this post or report if something's wrong."}
            </Text>

            <View style={styles.optionCard}>
              <OptionRow icon={Share2} label="Share" onPress={runShare} />
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
                  {authorId && (
                    <OptionRow
                      icon={ShieldBan}
                      label={authorUsername ? `Block @${authorUsername}` : "Block user"}
                      destructive
                      onPress={runBlockUser}
                    />
                  )}
                  <OptionRow
                    icon={Flag}
                    label="Report"
                    destructive
                    isLast
                    onPress={confirmReport}
                  />
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  },
  sheetHeaderTrailing: {
    width: 72,
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  bodyIntro: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
    marginBottom: 20,
  },
  optionCard: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
  },
  optionRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eaeaea",
  },
  optionRowPressed: {
    backgroundColor: "#f6f6f6",
  },
  optionLabel: {
    flex: 1,
    fontFamily: Fonts.instrument.semiBold,
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
