import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import Button from "./Button";

const ACTION_WIDTH = 92;
const OPEN_THRESHOLD = 46;

type Props = {
  children: ReactNode;
  /** Called after the user confirms; the row is already slid off-screen. */
  onDelete: () => void;
  confirmTitle?: string;
  confirmMessage?: string;
};

/**
 * Slide a row to the left to reveal a red Delete action. Releasing past the
 * threshold (or flicking) leaves it open; tapping Delete slides the row away.
 * Built on PanResponder + Animated so it needs no extra native dependency.
 */
export default function SwipeToDeleteRow({
  children,
  onDelete,
  confirmTitle = "Delete conversation?",
  confirmMessage = "All messages in this conversation will be deleted for you. The other person keeps their copy.",
}: Props) {
  const { width } = useWindowDimensions();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const base = useRef(0); // resting offset at gesture start (0 or open)
  const current = useRef(0);
  const openRef = useRef(false);

  useEffect(() => {
    const id = x.addListener(({ value }) => {
      current.current = value;
    });
    return () => x.removeListener(id);
  }, [x]);

  const animateTo = (to: number, duration = 180, done?: () => void) => {
    openRef.current = to === -ACTION_WIDTH;
    Animated.timing(x, {
      toValue: to,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => done?.());
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        base.current = openRef.current ? -ACTION_WIDTH : 0;
      },
      onPanResponderMove: (_, g) => {
        // Negative x = row slid left, revealing the action on the right.
        // It can follow the finger all the way across for a full swipe.
        const next = Math.max(-width, Math.min(0, base.current + g.dx));
        x.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const pos = current.current;
        const fullSwipe =
          pos < -width * 0.55 || (g.vx < -1.2 && pos < -ACTION_WIDTH * 1.4);
        if (fullSwipe) {
          confirmDelete();
          return;
        }
        const shouldOpen =
          g.vx < -0.5 || (g.vx < 0.5 && pos < -OPEN_THRESHOLD);
        animateTo(shouldOpen ? -ACTION_WIDTH : 0);
      },
      onPanResponderTerminate: () => animateTo(openRef.current ? -ACTION_WIDTH : 0),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // Slide the row away (Apple-style), then ask. Cancel brings it back.
  const confirmDelete = () => {
    animateTo(-width, 220);
    setConfirmOpen(true);
  };
  const cancelDelete = () => {
    setConfirmOpen(false);
    animateTo(0, 220);
  };
  const acceptDelete = () => {
    setConfirmOpen(false);
    onDelete();
  };
  const handleDelete = confirmDelete;

  return (
    <View style={styles.wrap}>
      <View style={styles.action} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.8}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete conversation"
        >
          <Trash2 size={22} color="#fff" strokeWidth={2.2} />
          <Text style={styles.actionLabel}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.row, { transform: [{ translateX: x }] }]}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>

      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <Pressable style={styles.modalBackdrop} onPress={cancelDelete}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{confirmTitle}</Text>
            <Text style={styles.modalBody}>{confirmMessage}</Text>
            <View style={styles.modalActions}>
              <View style={styles.modalActionCell}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  fullWidth
                  onPress={cancelDelete}
                />
              </View>
              <View style={styles.modalActionCell}>
                <Button
                  label="Delete"
                  variant="destructive"
                  fullWidth
                  onPress={acceptDelete}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: "#E5484D" },
  action: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  actionBtn: {
    width: ACTION_WIDTH,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: {
    color: "#fff",
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
  },
  row: { backgroundColor: Colors.light },
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
