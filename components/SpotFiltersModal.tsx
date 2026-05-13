import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

export type SpotFiltersValue = {
  nearbyOnly: boolean;
  mapReadyOnly: boolean;
  minRating: number;
  amenities: {
    wifi: boolean;
    outlets: boolean;
    foodDrink: boolean;
    whiteboards: boolean;
    groupWork: boolean;
  };
};

export const DEFAULT_SPOT_FILTERS: SpotFiltersValue = {
  nearbyOnly: false,
  mapReadyOnly: false,
  minRating: 0,
  amenities: {
    wifi: false,
    outlets: false,
    foodDrink: false,
    whiteboards: false,
    groupWork: false,
  },
};

export function countActiveFilters(filters: SpotFiltersValue) {
  let count = 0;
  if (filters.nearbyOnly) count += 1;
  if (filters.mapReadyOnly) count += 1;
  if (filters.minRating > 0) count += 1;
  count += Object.values(filters.amenities).filter(Boolean).length;
  return count;
}

type AmenityKey = keyof SpotFiltersValue["amenities"];

const AMENITY_OPTIONS: {
  key: AmenityKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "wifi", label: "Wi-Fi", icon: "wifi" },
  { key: "outlets", label: "Outlets", icon: "flash-outline" },
  { key: "foodDrink", label: "Food & Drinks", icon: "cafe-outline" },
  { key: "whiteboards", label: "Whiteboards", icon: "easel-outline" },
  { key: "groupWork", label: "Group Friendly", icon: "people-outline" },
];

const RATING_OPTIONS = [
  { value: 3, label: "3+" },
  { value: 3.5, label: "3.5+" },
  { value: 4, label: "4+" },
  { value: 4.5, label: "4.5+" },
];

const SCREEN_HEIGHT = Dimensions.get("window").height;

type Props = {
  visible: boolean;
  value: SpotFiltersValue;
  hasUserLocation: boolean;
  onChange: (next: SpotFiltersValue) => void;
  onClose: () => void;
  onReset: () => void;
};

export default function SpotFiltersModal({
  visible,
  value,
  hasUserLocation,
  onChange,
  onClose,
  onReset,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 320,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const toggleAmenity = (key: AmenityKey) => {
    onChange({
      ...value,
      amenities: {
        ...value.amenities,
        [key]: !value.amenities[key],
      },
    });
  };

  const setMinRating = (rating: number) => {
    onChange({
      ...value,
      minRating: value.minRating === rating ? 0 : rating,
    });
  };

  const activeCount = countActiveFilters(value);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            { transform: [{ translateY }] },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            <Text style={styles.subtitle}>
              {activeCount > 0
                ? `${activeCount} active`
                : "Refine your spots"}
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Section title="Distance">
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Within 10 km"
                  icon="location-outline"
                  active={value.nearbyOnly}
                  disabled={!hasUserLocation}
                  onPress={() =>
                    onChange({ ...value, nearbyOnly: !value.nearbyOnly })
                  }
                />
                <FilterChip
                  label="On the map"
                  icon="map-outline"
                  active={value.mapReadyOnly}
                  onPress={() =>
                    onChange({
                      ...value,
                      mapReadyOnly: !value.mapReadyOnly,
                    })
                  }
                />
              </View>
              {!hasUserLocation ? (
                <Text style={styles.helper}>
                  Enable location to filter by distance.
                </Text>
              ) : null}
            </Section>

            <View style={styles.divider} />

            <Section title="Minimum rating">
              <View style={styles.chipsRow}>
                {RATING_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    icon="star"
                    active={value.minRating === option.value}
                    onPress={() => setMinRating(option.value)}
                  />
                ))}
              </View>
            </Section>

            <View style={styles.divider} />

            <Section title="Amenities">
              <View style={styles.chipsRow}>
                {AMENITY_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.key}
                    label={option.label}
                    icon={option.icon}
                    active={value.amenities[option.key]}
                    onPress={() => toggleAmenity(option.key)}
                  />
                ))}
              </View>
            </Section>
          </ScrollView>

          <Pressable
            disabled={activeCount === 0}
            style={({ pressed }) => [
              styles.action,
              activeCount === 0 && styles.actionDisabled,
              pressed && activeCount > 0 && styles.actionPressed,
            ]}
            onPress={onReset}
          >
            <Ionicons
              name="refresh-outline"
              size={20}
              color={activeCount === 0 ? "#B5B5B5" : Colors.dark}
            />
            <Text
              style={[
                styles.actionText,
                activeCount === 0 && styles.actionTextDisabled,
              ]}
            >
              Reset Filters
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.applyBtn,
              pressed && styles.applyBtnPressed,
            ]}
            onPress={onClose}
          >
            <Text style={styles.applyText}>
              {activeCount > 0
                ? `Show Results (${activeCount})`
                : "Show Results"}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FilterChip({
  label,
  icon,
  active,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        active && styles.chipActive,
        disabled && styles.chipDisabled,
      ]}
    >
      <Ionicons name={icon} size={15} color={active ? "#fff" : Colors.dark} />
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 8,
    maxHeight: "88%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    marginBottom: 4,
  },
  title: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  subtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  section: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.dark,
  },
  chipLabelActive: {
    color: "#fff",
  },
  helper: {
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#888",
  },
  divider: {
    height: 1,
    backgroundColor: "#F4F4F4",
    marginHorizontal: 12,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 6,
  },
  actionPressed: {
    backgroundColor: "#F5F5F5",
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 16,
    color: Colors.dark,
  },
  actionTextDisabled: {
    color: "#B5B5B5",
  },
  applyBtn: {
    marginTop: 6,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: Colors.dark,
  },
  applyBtnPressed: {
    opacity: 0.85,
  },
  applyText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: "#fff",
  },
});
