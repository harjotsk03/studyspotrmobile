import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';

export default function ProfileStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statItem: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: '#555',
  },
  statValue: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
});