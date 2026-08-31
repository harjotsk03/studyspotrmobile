import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import Button from "./Button";

const DESTRUCTIVE = "#DC3545";
const MENU_WIDTH = 212;
const ROW_HEIGHT = 48;
const SCREEN_PAD = 10;
const ANCHOR_GAP = 6;

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ActionOption = {
  key: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  options: ActionOption[];
  anchor?: AnchorRect | null;
  title?: string;
  intro?: string;
};

function OptionRow(props: {
  icon: ActionOption["icon"];
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
      <Icon size={18} color={fg} strokeWidth={2.1} />
      <Text
        style={[
          styles.optionLabel,
          props.destructive && styles.optionLabelDestructive,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function placeMenu(args: {
  anchor: AnchorRect;
  cardW: number;
  cardH: number;
  windowW: number;
  windowH: number;
  topInset: number;
  bottomInset: number;
}) {
  const { anchor, cardW, cardH, windowW, windowH, topInset, bottomInset } =
    args;
  const spaceBelow =
    windowH - bottomInset - (anchor.y + anchor.height) - SCREEN_PAD;
  const spaceAbove = anchor.y - topInset - SCREEN_PAD;
  const placeAbove =
    spaceBelow < cardH && spaceAbove >= cardH
      ? true
      : spaceBelow >= cardH
        ? false
        : spaceAbove > spaceBelow;

  let top = placeAbove
    ? anchor.y - cardH - ANCHOR_GAP
    : anchor.y + anchor.height + ANCHOR_GAP;
  const minTop = topInset + SCREEN_PAD;
  const maxTop = windowH - bottomInset - cardH - SCREEN_PAD;
  if (top > maxTop) top = Math.max(minTop, maxTop);
  if (top < minTop) top = minTop;

  let left = anchor.x + anchor.width - cardW;
  if (left < SCREEN_PAD) left = SCREEN_PAD;
  if (left + cardW > windowW - SCREEN_PAD) {
    left = windowW - cardW - SCREEN_PAD;
  }
  return { top, left };
}

export default function ActionOptionsSheet({
  visible,
  onClose,
  options,
  anchor,
  title,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const [cardSize, setCardSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  useEffect(() => {
    if (!visible) setCardSize(null);
  }, [visible]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const runOption = useCallback(
    (action: () => void) => {
      onClose();
      setTimeout(action, 40);
    },
    [onClose],
  );

  const cardW = cardSize?.w ?? MENU_WIDTH;
  const cardH = cardSize?.h ?? Math.max(options.length, 1) * ROW_HEIGHT;

  const position = anchor
    ? placeMenu({
        anchor,
        cardW,
        cardH,
        windowW,
        windowH,
        topInset: insets.top,
        bottomInset: insets.bottom,
      })
    : {
        top: undefined as number | undefined,
        left: SCREEN_PAD,
        bottom: insets.bottom + 16,
      };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.popoverRoot} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
        />
        <View
          accessibilityRole="menu"
          accessibilityLabel={title}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (
              !cardSize ||
              Math.abs(cardSize.w - width) > 1 ||
              Math.abs(cardSize.h - height) > 1
            ) {
              setCardSize({ w: width, h: height });
            }
          }}
          style={[
            styles.popoverCard,
            anchor
              ? { top: position.top, left: position.left, width: MENU_WIDTH }
              : {
                  left: position.left,
                  bottom: "bottom" in position ? position.bottom : undefined,
                  width: windowW - SCREEN_PAD * 2,
                },
          ]}
        >
          {options.map((option, index) => (
            <OptionRow
              key={option.key}
              icon={option.icon}
              label={option.label}
              destructive={option.destructive}
              isLast={index === options.length - 1}
              onPress={() => runOption(option.onPress)}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
}

export function ConfirmActionModal({
  visible,
  title,
  body,
  confirmLabel = "Delete",
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!loading) onCancel();
      }}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => {
          if (!loading) onCancel();
        }}
      >
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalBody}>{body}</Text>
          <View style={styles.modalActions}>
            <View style={styles.modalActionCell}>
              <Button
                label="Cancel"
                variant="secondary"
                fullWidth
                onPress={onCancel}
                disabled={loading}
              />
            </View>
            <View style={styles.modalActionCell}>
              <Button
                label={confirmLabel}
                variant="destructive"
                fullWidth
                onPress={onConfirm}
                disabled={loading}
                loading={loading}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  popoverRoot: {
    flex: 1,
  },
  popoverCard: {
    position: "absolute",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: ROW_HEIGHT,
    paddingVertical: 12,
    paddingHorizontal: 14,
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
    fontSize: 15,
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
