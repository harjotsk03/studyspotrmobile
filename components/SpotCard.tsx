import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

type SpotCardProps = {
  title: string;
  description: string;
  metaLabel: string;
  hasCoordinates: boolean;
  compact?: boolean;
  active?: boolean;
  width?: number;
  showViewOnMap?: boolean;
  onPress: () => void;
  onViewOnMap?: () => void;
};

export default function SpotCard({
  title,
  description,
  metaLabel,
  hasCoordinates,
  compact = false,
  active = false,
  width,
  showViewOnMap = false,
  onPress,
  onViewOnMap,
}: SpotCardProps) {
  return (
    <Pressable
      style={[
        compact ? styles.carouselCard : styles.listCard,
        active && styles.activeCard,
        compact && width ? { width } : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        {hasCoordinates ? (
          <View style={styles.mapReadyBadge}>
            <Ionicons name="location" size={12} color={Colors.accent} />
            <Text style={styles.mapReadyLabel}>Map</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.cardBody} numberOfLines={compact ? 2 : 3}>
        {description}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>{metaLabel}</Text>
        {showViewOnMap && onViewOnMap ? (
          <Pressable onPress={onViewOnMap} style={styles.viewOnMapButton}>
            <Text style={styles.viewOnMapLabel}>View on map</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carouselCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  activeCard: {
    borderColor: Colors.accent,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  mapReadyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FFF3E3",
  },
  mapReadyLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    color: Colors.accent,
  },
  cardBody: {
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 21,
    color: "#666",
  },
  cardFooter: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardMeta: {
    flex: 1,
    fontFamily: Fonts.instrument.medium,
    fontSize: 12,
    color: "#8A8A8A",
  },
  viewOnMapButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F3F3",
  },
  viewOnMapLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 12,
    color: Colors.dark,
  },
});
