import { Modal, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';

type DeleteAccountModalProps = {
  visible: boolean;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeleteAccountModal({
  visible,
  deleting,
  onClose,
  onConfirm,
}: DeleteAccountModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !deleting && onClose()}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delete Account</Text>

          <Text style={styles.cardBody}>
            Are you sure you want to permanently delete your account?{"\n\n"}
            This action is <Text style={styles.bold}>irreversible</Text>. All of
            your data will be permanently removed, including:
          </Text>

          <View style={styles.list}>
            <Text style={styles.listItem}>{"\u2022"} Your profile and personal info</Text>
            <Text style={styles.listItem}>{"\u2022"} Posts, comments, and activity</Text>
            <Text style={styles.listItem}>{"\u2022"} Community memberships</Text>
            <Text style={styles.listItem}>{"\u2022"} All saved content and preferences</Text>
          </View>

          <Text style={[styles.cardBody, styles.confirmText]}>
            This cannot be undone. Please confirm you understand.
          </Text>

          <View style={styles.cardButtons}>
            <Button
              label="NO, GO BACK"
              variant="outline"
              disabled={deleting}
              style={styles.inlineButton}
              onPress={onClose}
            />
            <Button
              label="Delete Account"
              variant="destructive"
              loading={deleting}
              style={styles.inlineButton}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    width: '100%',
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
  bold: {
    fontFamily: Fonts.instrument.bold,
  },
  list: {
    marginTop: 12,
    gap: 6,
  },
  listItem: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  confirmText: {
    marginTop: 12,
  },
  cardButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  inlineButton: {
    flex: 1,
  },
});
