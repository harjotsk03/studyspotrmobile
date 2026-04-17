import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Clock3, MapPin, Star, UserRound } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { StudySpot } from "../context/SpotsContext";
import { getSpotDescription } from "../utils/getSpotDescription";
import { getSpotTitle } from "../utils/getSpotTitle";
import { toNumber } from "../utils/toNumber";

export type SpotsStackParamList = {
  SpotsHome: undefined;
  SpotDetail: { spot: StudySpot };
};

type Props = NativeStackScreenProps<SpotsStackParamList, "SpotDetail">;

function formatRating(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "No rating yet";
  }

  return `${parsed.toFixed(1)} / 5`;
}

function formatCount(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }

  return `${Math.round(parsed)} reviews`;
}

function getNoiseLabel(spot: StudySpot) {
  if (typeof spot.noise_level === "string" && spot.noise_level.trim()) {
    return spot.noise_level;
  }

  if (typeof spot.noice_level === "string" && spot.noice_level.trim()) {
    return spot.noice_level;
  }

  return null;
}

function getFeatureRows(spot: StudySpot) {
  return [
    { label: "Food & drinks allowed", value: spot.food_drink_allowed },
    { label: "Wi-Fi available", value: spot.wifi_available },
    { label: "Outlets available", value: spot.outlets_available },
    { label: "Whiteboards available", value: spot.whiteboards_available },
    { label: "Group work friendly", value: spot.group_work_friendly },
  ];
}

export default function SpotDetailScreen({ route }: Props) {
  const { spot } = route.params;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const title = getSpotTitle(spot);
  const description = getSpotDescription(spot);
  const ratingLabel = formatRating(spot.rating);
  const reviewCountLabel = formatCount(spot.rating_count);
  const noiseLabel = getNoiseLabel(spot);
  const infoRows = [
    { label: "Address", value: spot.address },
    { label: "Open", value: spot.open_time },
    { label: "Close", value: spot.close_time },
    { label: "Noise", value: noiseLabel },
    { label: "Lighting", value: spot.lighting },
    { label: "Tables", value: spot.tables },
  ].filter(
    (row): row is { label: string; value: string } =>
      typeof row.value === "string" && row.value.trim().length > 0,
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {spot.image_url ? (
          <Image source={{ uri: spot.image_url }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroFallback}>
            <Text style={styles.heroInitial}>{title.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.introCard}>
          <Text style={styles.name}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Star size={15} color={Colors.accent} fill={Colors.accent} />
              <Text style={styles.metaText}>{ratingLabel}</Text>
            </View>
            {reviewCountLabel ? (
              <View style={styles.metaPill}>
                <Text style={styles.metaText}>{reviewCountLabel}</Text>
              </View>
            ) : null}
          </View>

          {spot.address ? (
            <View style={styles.inlineInfoRow}>
              <MapPin size={16} color="#777" />
              <Text style={styles.inlineInfoText}>{spot.address}</Text>
            </View>
          ) : null}

          {(spot.open_time || spot.close_time) ? (
            <View style={styles.inlineInfoRow}>
              <Clock3 size={16} color="#777" />
              <Text style={styles.inlineInfoText}>
                {[spot.open_time, spot.close_time].filter(Boolean).join(" - ")}
              </Text>
            </View>
          ) : null}

          {spot.created_by_name ? (
            <View style={styles.inlineInfoRow}>
              <UserRound size={16} color="#777" />
              <Text style={styles.inlineInfoText}>Added by {spot.created_by_name}</Text>
            </View>
          ) : null}
        </View>

        {infoRows.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            {infoRows.map((row) => (
              <View key={row.label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.section, styles.lastSection]}>
          <Text style={styles.sectionTitle}>Amenities</Text>
          {getFeatureRows(spot).map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value ? "Yes" : "No"}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginHorizontal: 12,
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  content: {
    flex: 1,
  },
  heroImage: {
    width: "100%",
    height: 220,
    backgroundColor: "#EDEDED",
  },
  heroFallback: {
    height: 220,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  heroInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 72,
    color: "rgba(255,255,255,0.42)",
  },
  introCard: {
    padding: 20,
    backgroundColor: "#fff",
  },
  name: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 28,
    color: Colors.dark,
  },
  description: {
    marginTop: 8,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F8F8F8",
  },
  metaText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.dark,
  },
  inlineInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
  },
  inlineInfoText: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    lineHeight: 21,
  },
  section: {
    marginTop: 12,
    padding: 20,
    backgroundColor: "#fff",
  },
  lastSection: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 20,
    color: Colors.dark,
    marginBottom: 10,
  },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
  },
  infoLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  infoValue: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 21,
  },
});
