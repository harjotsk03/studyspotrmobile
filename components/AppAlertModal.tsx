import { Modal, StyleSheet, Text, View } from "react-native";
import { useCallback, useState } from "react";
import Button from "./Button";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  actionLabel?: string;
  onClose: () => void;
};

export default function AppAlertModal({
  visible,
  title,
  message,
  actionLabel = "OK",
  onClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardBody}>{message}</Text>
          <View style={styles.cardButtons}>
            <Button
              label={actionLabel}
              variant="default"
              style={styles.action}
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function useAppAlert() {
  const [alert, setAlert] = useState({
    visible: false,
    title: "",
    message: "",
    actionLabel: "OK",
  });

  const showAlert = useCallback(
    (title: string, message: string, actionLabel = "OK") => {
      setAlert({ visible: true, title, message, actionLabel });
    },
    [],
  );

  const modal = (
    <AppAlertModal
      visible={alert.visible}
      title={alert.title}
      message={alert.message}
      actionLabel={alert.actionLabel}
      onClose={() => setAlert((current) => ({ ...current, visible: false }))}
    />
  );

  return { showAlert, modal };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    width: "100%",
  },
  cardTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    marginBottom: 12,
  },
  cardBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  cardButtons: {
    marginTop: 20,
  },
  action: {
    alignSelf: "stretch",
  },
});
