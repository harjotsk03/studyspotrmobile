import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { StudySpot } from "../context/SpotsContext";
import { getSpotTitle } from "../utils/getSpotTitle";
import { toNumber } from "../utils/toNumber";

type SpotCardProps = {
  spot: StudySpot;
  metaLabel: string;
  hasCoordinates: boolean;
  compact?: boolean;
  active?: boolean;
  width?: number;
  showViewOnMap?: boolean;
  onPress: () => void;
  onViewOnMap?: () => void;
};

type AmenityIcon = {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function getAmenityIcons(spot: StudySpot): AmenityIcon[] {
  const items: AmenityIcon[] = [
    { active: spot.wifi_available === true, icon: "wifi", label: "Wi-Fi" },
    {
      active: spot.outlets_available === true,
      icon: "flash-outline",
      label: "Outlets",
    },
    {
      active: spot.food_drink_allowed === true,
      icon: "cafe-outline",
      label: "Food",
    },
    {
      active: spot.whiteboards_available === true,
      icon: "easel-outline",
      label: "Boards",
    },
    {
      active: spot.group_work_friendly === true,
      icon: "people-outline",
      label: "Group",
    },
  ];
  return items.filter((item) => item.active);
}

function formatRating(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return parsed.toFixed(1);
}

function formatReviewCount(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) return null;
  if (parsed >= 1000) return `${(parsed / 1000).toFixed(1)}k`;
  return `${Math.round(parsed)}`;
}

export default function SpotCard({
  spot,
  metaLabel,
  hasCoordinates,
  compact = false,
  active = false,
  width,
  showViewOnMap = false,
  onPress,
  onViewOnMap,
}: SpotCardProps) {
  const title = getSpotTitle(spot);
  const ratingLabel = formatRating(spot.rating);
  const reviewCount = formatReviewCount(spot.rating_count);
  const address =
    typeof spot.address === "string" && spot.address.trim().length > 0
      ? spot.address
      : null;
  const amenities = getAmenityIcons(spot);
  const initial = title.charAt(0).toUpperCase();

  const containerStyle = [
    compact ? styles.carouselCard : styles.listCard,
    active && styles.activeCard,
    compact && width ? { width } : null,
  ];

  return (
    <Pressable style={containerStyle} onPress={onPress}>
      <View style={compact ? styles.heroCompact : styles.heroFull}>
        {spot.image_url ? (
          <Image
            source={{ uri: spot.image_url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
            <Text
              style={compact ? styles.heroInitialCompact : styles.heroInitial}
            >
              {initial}
            </Text>
          </View>
        )}

        {ratingLabel ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={11} color={Colors.accent} />
            <Text style={styles.ratingBadgeLabel}>{ratingLabel}</Text>
            {reviewCount ? (
              <Text style={styles.ratingBadgeCount}>({reviewCount})</Text>
            ) : null}
          </View>
        ) : null}

        {hasCoordinates ? (
          <View style={styles.mapBadge}>
            <Ionicons name="location" size={11} color="#fff" />
          </View>
        ) : null}
      </View>

      <View style={compact ? styles.bodyCompact : styles.body}>
        <Text
          style={compact ? styles.titleCompact : styles.title}
          numberOfLines={1}
        >
          {title}
        </Text>

        {address ? (
          <View style={styles.row}>
            <Ionicons
              name="location-outline"
              size={13}
              color="#8A8A8A"
              style={styles.rowIcon}
            />
            <Text
              style={compact ? styles.metaCompact : styles.meta}
              numberOfLines={1}
            >
              {address}
            </Text>
          </View>
        ) : null}

        {!compact && amenities.length > 0 ? (
          <View style={styles.amenitiesRow}>
            {amenities.slice(0, 5).map((item) => (
              <View key={item.label} style={styles.amenityChip}>
                <Ionicons name={item.icon} size={12} color={Colors.dark} />
                <Text style={styles.amenityLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={compact ? styles.footerCompact : styles.footer}>
          <View style={styles.footerLeft}>
            <Ionicons name="navigate-outline" size={13} color={Colors.dark} />
            <Text style={styles.footerMeta} numberOfLines={1}>
              {metaLabel}
            </Text>
          </View>

          {showViewOnMap && onViewOnMap ? (
            <Pressable
              onPress={onViewOnMap}
              style={({ pressed }) => [
                styles.viewOnMapButton,
                pressed && styles.viewOnMapButtonPressed,
              ]}
              hitSlop={8}
            >
              <Ionicons name="map" size={13} color="#fff" />
              <Text style={styles.viewOnMapLabel}>View on map</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carouselCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ECECEC",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ECECEC",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  activeCard: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  heroFull: {
    width: "100%",
    height: 140,
    backgroundColor: "#EDEDED",
    position: "relative",
  },
  heroCompact: {
    width: "100%",
    height: 90,
    backgroundColor: "#EDEDED",
    position: "relative",
  },
  heroFallback: {
    backgroundColor: "#1A61A8",
    alignItems: "center",
    justifyContent: "center",
  },
  heroInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 56,
    color: "#fff",
    opacity: 0.85,
  },
  heroInitialCompact: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 36,
    color: "#fff",
    opacity: 0.85,
  },
  ratingBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  ratingBadgeLabel: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 12,
    color: Colors.dark,
  },
  ratingBadgeCount: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    color: "#888",
    marginLeft: 1,
  },
  mapBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 14,
    gap: 8,
  },
  bodyCompact: {
    padding: 12,
    gap: 6,
  },
  title: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  titleCompact: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rowIcon: {
    marginRight: 2,
  },
  meta: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#666",
  },
  metaCompact: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#777",
  },
  amenitiesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  amenityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F2F2F2",
  },
  amenityLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    color: Colors.dark,
  },
  footer: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  footerCompact: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  footerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerMeta: {
    flex: 1,
    fontFamily: Fonts.gabarito.medium,
    fontSize: 12,
    color: Colors.dark,
  },
  viewOnMapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.dark,
  },
  viewOnMapButtonPressed: {
    opacity: 0.85,
  },
  viewOnMapLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    color: "#fff",
  },
});
