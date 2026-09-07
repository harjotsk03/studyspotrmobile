import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

export default function ProfileStat({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${value} ${label}`}
        style={({ pressed }) => [styles.statItem, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.statItem}>{content}</View>;
}

const styles = StyleSheet.create({
  statItem: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  pressed: {
    opacity: 0.65,
  },
  statLabel: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
    color: "#555",
    marginTop: 2,
  },
  statValue: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
});
