import { useCallback, type ComponentType } from "react";
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
import { Flag, Send, Share2, Trash2 } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

export type FeedPostOptionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  /** Native share sheet (caption + URL). */
  onShare: () => void;
  onDeleteConfirmed: () => Promise<void>;
  onReportConfirmed: () => Promise<void>;
  /** Opens in-app recipients picker (conversation list). */
  onShareWithFriends?: () => void;
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

/**
 * Post actions — same presentation as FeedComposerModal (page sheet slide, light shell, header + ScrollView).
 */
export default function FeedPostOptionsSheet({
  visible,
  onClose,
  isOwner,
  onShare,
  onShareWithFriends,
  onDeleteConfirmed,
  onReportConfirmed,
}: FeedPostOptionsSheetProps) {
  const insets = useSafeAreaInsets();

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const confirmDelete = useCallback(() => {
    handleClose();
    requestAnimationFrame(() => {
      Alert.alert(
        "Delete post?",
        "This removes the post for everyone. This can’t be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await onDeleteConfirmed();
                } catch (e) {
                  Alert.alert(
                    "Error",
                    e instanceof Error ? e.message : "Could not delete post.",
                  );
                }
              })();
            },
          },
        ],
      );
    });
  }, [handleClose, onDeleteConfirmed]);

  const confirmReport = useCallback(() => {
    handleClose();
    requestAnimationFrame(() => {
      Alert.alert(
        "Report this post?",
        "Our team will review it against community guidelines.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Report",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await onReportConfirmed();
                  Alert.alert("Thanks", "We received your report.");
                } catch (e) {
                  Alert.alert(
                    "Report",
                    e instanceof Error ? e.message : "Could not submit report.",
                  );
                }
              })();
            },
          },
        ],
      );
    });
  }, [handleClose, onReportConfirmed]);

  const runShare = useCallback(() => {
    handleClose();
    requestAnimationFrame(() => onShare());
  }, [handleClose, onShare]);

  const runShareFriends = useCallback(() => {
    handleClose();
    requestAnimationFrame(() => onShareWithFriends?.());
  }, [handleClose, onShareWithFriends]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
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
              : "Share this post or report if something’s wrong."}
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
              <OptionRow
                icon={Flag}
                label="Report"
                destructive
                isLast
                onPress={confirmReport}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* Shell + header + body gutters match FeedComposerModal */
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
});
