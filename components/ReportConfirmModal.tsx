import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Button from "./Button";

type ContentType =
  | "user"
  | "post"
  | "comment"
  | "spot"
  | "review"
  | "community"
  | "event";

type Props = {
  visible: boolean;
  onClose: () => void;
  contentType: ContentType;
  contentId: string;
  contentLabel?: string;
};

export default function ReportConfirmModal({
  visible,
  onClose,
  contentType,
  contentId,
  contentLabel,
}: Props) {
  const { token } = useAuth();
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [loading, setLoading] = useState(false);

  const reset = useCallback(() => {
    setReason("");
    setStep("confirm");
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleSubmit = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/report`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          content_type: contentType,
          content_id: contentId,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not submit report.");
      }
      setStep("done");
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not submit report.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, contentType, contentId, reason]);

  const label =
    contentLabel ??
    contentType.charAt(0).toUpperCase() + contentType.slice(1);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleClose}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {step === "confirm" ? (
              <>
                <Text style={styles.modalTitle}>Report {label}?</Text>
                <Text style={styles.modalBody}>
                  Our team will review this against our community guidelines.
                  This action can't be undone.
                </Text>

                <TextInput
                  style={styles.reasonInput}
                  placeholder="Add a reason (optional)"
                  placeholderTextColor="#999"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  blurOnSubmit
                  returnKeyType="done"
                  maxLength={500}
                  textAlignVertical="top"
                />

                <View style={styles.modalActions}>
                  <View style={styles.modalActionCell}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      fullWidth
                      onPress={handleClose}
                      disabled={loading}
                    />
                  </View>
                  <View style={styles.modalActionCell}>
                    <Button
                      label="Report"
                      variant="destructive"
                      fullWidth
                      onPress={() => void handleSubmit()}
                      disabled={loading}
                      loading={loading}
                    />
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Thank You</Text>
                <Text style={styles.modalBody}>
                  Thank you for reporting. We will have someone look into it.
                </Text>
                <View style={styles.modalActions}>
                  <View style={styles.modalActionCell}>
                    <Button
                      label="Done"
                      variant="accent"
                      fullWidth
                      onPress={handleClose}
                    />
                  </View>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
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
  reasonInput: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    backgroundColor: "#F6F6F6",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 80,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 21,
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
