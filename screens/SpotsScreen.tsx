import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SpotCard from "../components/SpotCard";
import SpotMapPin from "../components/SpotMapPin";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import {
  type SpotsViewMode,
  type StudySpot,
  useSpots,
} from "../context/SpotsContext";
import { calculateDistanceKm } from "../utils/calculateDistanceKm";
import { formatDistance } from "../utils/formatDistance";
import { getSpotCoordinates } from "../utils/getSpotCoordinates";
import { getSpotDescription } from "../utils/getSpotDescription";
import { getSpotScore } from "../utils/getSpotScore";
import { getSpotSearchText } from "../utils/getSpotSearchText";
import { getSpotTitle } from "../utils/getSpotTitle";

const CAROUSEL_GAP = 12;
const MINIMAL_MAP_STYLE = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];

type SpotFilterKey = "all" | "mapReady" | "nearby";

export default function SpotsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const mapRef = useRef<MapView | null>(null);
  const previousSearchValue = useRef("");

  const {
    spots,
    spotsLoading,
    spotsError,
    refetchSpots,
    viewMode,
    setViewMode,
  } = useSpots();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSpotId, setActiveSpotId] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<SpotFilterKey>("all");
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const hasActiveSearch = trimmedQuery.length > 0;
  const effectiveViewMode: SpotsViewMode = hasActiveSearch ? "list" : viewMode;

  useEffect(() => {
    const previousTrimmed = previousSearchValue.current.trim();
    if (!previousTrimmed && trimmedQuery) {
      setViewMode("list");
    }
    previousSearchValue.current = searchQuery;
  }, [searchQuery, setViewMode, trimmedQuery]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== "granted") {
        return;
      }

      try {
        const result = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setUserLocation({
            latitude: result.coords.latitude,
            longitude: result.coords.longitude,
          });
        }
      } catch {
        if (!cancelled) {
          setUserLocation(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSpots = useMemo(() => {
    let next = spots.filter((spot) =>
      trimmedQuery ? getSpotSearchText(spot).includes(trimmedQuery) : true,
    );

    if (filterKey === "mapReady") {
      next = next.filter((spot) => getSpotCoordinates(spot));
    }

    if (filterKey === "nearby" && userLocation) {
      next = next.filter((spot) => {
        const coords = getSpotCoordinates(spot);
        if (!coords) {
          return false;
        }

        return calculateDistanceKm(userLocation, coords) <= 10;
      });
    }

    if (!userLocation) {
      return next;
    }

    return [...next].sort((left, right) => {
      const leftCoords = getSpotCoordinates(left);
      const rightCoords = getSpotCoordinates(right);
      const leftDistance = leftCoords
        ? calculateDistanceKm(userLocation, leftCoords)
        : Number.POSITIVE_INFINITY;
      const rightDistance = rightCoords
        ? calculateDistanceKm(userLocation, rightCoords)
        : Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance;
    });
  }, [filterKey, spots, trimmedQuery, userLocation]);

  const mapSpots = useMemo(
    () => filteredSpots.filter((spot) => getSpotCoordinates(spot)),
    [filteredSpots],
  );

  useEffect(() => {
    if (
      effectiveViewMode !== "map" ||
      Platform.OS === "web" ||
      !mapRef.current
    ) {
      return;
    }

    const coordinates = mapSpots
      .map((spot) => getSpotCoordinates(spot))
      .filter(
        (coordinate): coordinate is { latitude: number; longitude: number } =>
          coordinate !== null,
      );

    if (userLocation) {
      coordinates.push(userLocation);
    }

    if (!coordinates.length) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!mapRef.current) {
        return;
      }

      if (coordinates.length === 1) {
        mapRef.current.animateToRegion({
          ...coordinates[0],
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
        return;
      }

      mapRef.current.fitToCoordinates(coordinates, {
        animated: true,
        edgePadding: {
          top: 140,
          right: 60,
          bottom: tabBarHeight + 220,
          left: 60,
        },
      });
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [effectiveViewMode, mapSpots, tabBarHeight, userLocation]);

  const cardWidth = Math.min(width * 0.78, 320);

  const focusSpotOnMap = (spot: StudySpot) => {
    const coords = getSpotCoordinates(spot);
    setActiveSpotId(spot.id);

    if (!coords || !mapRef.current) {
      return;
    }

    mapRef.current.animateToRegion({
      ...coords,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    });
  };

  const renderSpotCard = (spot: StudySpot, compact = false) => {
    const coords = getSpotCoordinates(spot);
    const distanceLabel =
      coords && userLocation
        ? formatDistance(calculateDistanceKm(userLocation, coords))
        : null;
    const metaLabel =
      distanceLabel ?? (coords ? "Tap to focus on map" : "No coordinates yet");

    return (
      <SpotCard
        title={getSpotTitle(spot)}
        description={getSpotDescription(spot)}
        metaLabel={metaLabel}
        hasCoordinates={Boolean(coords)}
        compact={compact}
        active={activeSpotId === spot.id}
        width={compact ? cardWidth : undefined}
        showViewOnMap={effectiveViewMode === "list"}
        onPress={() => {
          focusSpotOnMap(spot);
          if (!hasActiveSearch) {
            setViewMode("map");
          }
        }}
        onViewOnMap={() => {
          setViewMode("map");
          focusSpotOnMap(spot);
        }}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Text style={styles.title}>Spots</Text>

        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Ionicons name="search" size={20} color="#8C8C8C" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search spots or locations"
              placeholderTextColor="#8C8C8C"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color="#8C8C8C" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.toolbarRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {[
              { key: "all", label: "All" },
              { key: "mapReady", label: "Map Ready" },
              { key: "nearby", label: "Nearby" },
            ].map((filter) => {
              const selected = filterKey === filter.key;
              const disabled = filter.key === "nearby" && !userLocation;

              return (
                <Pressable
                  key={filter.key}
                  onPress={() =>
                    !disabled && setFilterKey(filter.key as SpotFilterKey)
                  }
                  style={[
                    styles.filterChip,
                    selected && styles.filterChipActive,
                    disabled && styles.filterChipDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipLabel,
                      selected && styles.filterChipLabelActive,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.viewToggle}>
            <Pressable
              onPress={() => setViewMode("map")}
              style={[
                styles.viewToggleButton,
                viewMode === "map" && styles.viewToggleButtonActive,
              ]}
            >
              <Ionicons
                name="map"
                size={16}
                color={viewMode === "map" ? "#fff" : Colors.dark}
              />
              <Text
                style={[
                  styles.viewToggleLabel,
                  viewMode === "map" && styles.viewToggleLabelActive,
                ]}
              >
                Map
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setViewMode("list")}
              style={[
                styles.viewToggleButton,
                viewMode === "list" && styles.viewToggleButtonActive,
              ]}
            >
              <Ionicons
                name="list"
                size={16}
                color={viewMode === "list" ? "#fff" : Colors.dark}
              />
              <Text
                style={[
                  styles.viewToggleLabel,
                  viewMode === "list" && styles.viewToggleLabelActive,
                ]}
              >
                List
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {spotsLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.stateText}>Loading spots...</Text>
        </View>
      ) : spotsError ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{spotsError}</Text>
          <Pressable
            onPress={() => void refetchSpots()}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonLabel}>Retry</Text>
          </Pressable>
        </View>
      ) : effectiveViewMode === "map" ? (
        <View style={styles.mapContainer}>
          {Platform.OS === "web" ? (
            <View style={styles.centeredState}>
              <Text style={styles.stateText}>
                Map view is only available on iOS and Android.
              </Text>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              customMapStyle={MINIMAL_MAP_STYLE}
              initialRegion={{
                latitude: userLocation?.latitude ?? 37.78825,
                longitude: userLocation?.longitude ?? -122.4324,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              showsUserLocation={false}
              showsMyLocationButton={false}
              showsCompass={false}
              showsBuildings={false}
              showsTraffic={false}
              showsIndoors={false}
              toolbarEnabled={false}
            >
              {mapSpots.map((spot) => {
                const coords = getSpotCoordinates(spot);
                if (!coords) {
                  return null;
                }

                return (
                  <Marker
                    key={spot.id}
                    coordinate={coords}
                    anchor={{ x: 0.5, y: 1 }}
                    title={getSpotTitle(spot)}
                    description={getSpotDescription(spot)}
                    onPress={() => setActiveSpotId(spot.id)}
                  >
                    <SpotMapPin
                      rating={getSpotScore(spot)}
                      selected={activeSpotId === spot.id}
                    />
                  </Marker>
                );
              })}
            </MapView>
          )}

          <View
            style={[
              styles.carouselWrapper,
              { bottom: Math.max(insets.bottom, 6) },
            ]}
            pointerEvents="box-none"
          >
            <FlatList
              data={mapSpots}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.carouselContent}
              ItemSeparatorComponent={() => (
                <View style={{ width: CAROUSEL_GAP }} />
              )}
              renderItem={({ item }) => renderSpotCard(item, true)}
              ListEmptyComponent={
                <View style={[styles.emptyMapState, { width: width - 40 }]}>
                  <Text style={styles.stateText}>
                    {filteredSpots.length
                      ? "These spots don't have map coordinates yet."
                      : "No spots match your search right now."}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredSpots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + Math.max(insets.bottom, 24) },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => renderSpotCard(item)}
          ListEmptyComponent={
            <View style={styles.emptyListState}>
              <Text style={styles.stateText}>
                No spots match your search right now.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    backgroundColor: Colors.light,
    zIndex: 10,
  },
  title: {
    fontSize: 32,
    fontFamily: Fonts.gabarito.bold,
    color: Colors.dark,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark,
    paddingVertical: 0,
    fontFamily: Fonts.instrument.regular,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  filterRow: {
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },
  filterChipActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
  filterChipDisabled: {
    opacity: 0.45,
  },
  filterChipLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.dark,
  },
  filterChipLabelActive: {
    color: "#fff",
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },
  viewToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  viewToggleButtonActive: {
    backgroundColor: Colors.dark,
  },
  viewToggleLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.dark,
  },
  viewToggleLabelActive: {
    color: "#fff",
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  stateText: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    color: "#666",
    fontFamily: Fonts.instrument.regular,
  },
  errorText: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    color: Colors.dark,
    fontFamily: Fonts.instrument.regular,
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  retryButtonLabel: {
    color: Colors.primary,
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
  },
  mapContainer: {
    flex: 1,
  },
  carouselWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  carouselContent: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyMapState: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    alignSelf: "center",
  },
  emptyListState: {
    paddingTop: 40,
    alignItems: "center",
  },
});
