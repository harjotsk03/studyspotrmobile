import { StyleSheet, Text, View } from "react-native";

const BUBBLE = 28;
const BUBBLE_SELECTED = 32;

type SpotMapPinProps = {
  rating: number;
  selected?: boolean;
};

export function formatRatingShort(rating: number) {
  const clamped = Math.max(0, Math.min(10, rating));
  return Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1);
}

export function ratingToPinColor(rating: number) {
  const clamped = Math.max(0, Math.min(10, rating));

  if (clamped <= 3) {
    return "#DC2626";
  }

  if (clamped <= 7) {
    return "#F59E0B";
  }

  return "#16A34A";
}

export default function SpotMapPin({
  rating,
  selected = false,
}: SpotMapPinProps) {
  const color = ratingToPinColor(rating);
  const label = formatRatingShort(rating);
  const bubble = selected ? BUBBLE_SELECTED : BUBBLE;

  return (
    <View
      style={[styles.wrap, selected && styles.wrapSelected]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.bubble,
          selected && styles.bubbleSelected,
          {
            width: bubble,
            height: bubble,
            borderRadius: bubble / 2,
            backgroundColor: color,
            borderColor: color,
          },
        ]}
      >
        <Text style={[styles.bubbleText, selected && styles.bubbleTextSelected]}>
          {label}
        </Text>
      </View>
      <View
        style={[
          styles.triangle,
          selected && styles.triangleSelected,
          { borderTopColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  wrapSelected: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 8,
  },
  bubble: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  bubbleSelected: {
    borderWidth: 3,
  },
  bubbleText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  bubbleTextSelected: {
    fontSize: 13,
    fontWeight: "700",
  },
  triangle: {
    width: 0,
    height: 0,
    marginTop: -4,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  triangleSelected: {
    marginTop: -5,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 14,
  },
});
