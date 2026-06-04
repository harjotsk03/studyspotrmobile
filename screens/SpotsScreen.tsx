import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SpotCard from "../components/SpotCard";
import SpotFiltersModal, {
  DEFAULT_SPOT_FILTERS,
  countActiveFilters,
  type SpotFiltersValue,
} from "../components/SpotFiltersModal";
import SpotMapPin from "../components/SpotMapPin";
import {
  SkeletonBox,
  SkeletonCard,
  SkeletonList,
} from "../components/Skeleton";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
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
import { toNumber } from "../utils/toNumber";
import type { SpotsStackParamList } from "../types/navigation";
import Button from "../components/Button";
import {
  Coffee,
  Filter,
  LocateIcon,
  MapPin,
  Presentation,
  Star,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react-native";

const CAROUSEL_GAP = 12;
const DEFAULT_USER_REGION_DELTA = 0.012;
const MINIMAL_MAP_STYLE = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.business",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.medical",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.school",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.government",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.place_of_worship",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.attraction",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.park",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit.station",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit.line",
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

export default function SpotsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const mapRef = useRef<MapView | null>(null);
  // Ref to the list-view FlatList so we can scroll it back to the top when
  // filters change. The ref object itself is stable across renders so it
  // safely lives inside the `listLayer` useMemo below.
  const listRef = useRef<FlatList<StudySpot> | null>(null);
  // Skip the very first render so the camera-fit / scroll-to-top effect
  // only fires on subsequent filter mutations.
  const didMountRef = useRef(false);
  const previousSearchValue = useRef("");
  const navigation =
    useNavigation<NativeStackNavigationProp<SpotsStackParamList>>();
  const { profile } = useAuth();

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
  const [pendingFocusSpotId, setPendingFocusSpotId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] =
    useState<SpotFiltersValue>(DEFAULT_SPOT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mapCarouselHeight, setMapCarouselHeight] = useState(0);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // Tracks whether the visible map region is currently centered on the
  // user. Drives the recenter button's variant — it shifts from
  // `secondary` (subtle, off-white) to `default` (Colors.primary blue)
  // the moment the user pans/taps away, so they always know it's
  // actionable. Initial value is true because we either start at the
  // user's location or at the fallback region until permission resolves.
  const [isMapCenteredOnUser, setIsMapCenteredOnUser] = useState(true);
  const silentRefreshInFlightRef = useRef(false);

  // Same slider model as CommunityScreen: 0 = map, 1 = list.
  // JS driver because text color interpolation is JS-only.
  const tabAnim = useRef(new Animated.Value(0)).current;
  const [tabSwitchInnerWidth, setTabSwitchInnerWidth] = useState(0);

  const handleManualRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refetchSpots();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refetchSpots]);

  // Keep spots fresh in the background without requiring user action.
  // This silently re-fetches every 5s and updates whichever view is open.
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (silentRefreshInFlightRef.current || refreshing) return;
      silentRefreshInFlightRef.current = true;
      void refetchSpots().finally(() => {
        silentRefreshInFlightRef.current = false;
      });
    }, 5000);

    return () => clearInterval(intervalId);
  }, [refetchSpots, refreshing]);

  // Animate the toggle pill whenever the effective mode changes.
  // We use effective mode (not raw `viewMode`) so when search forces list
  // mode, the control visuals stay truthful.
  useEffect(() => {
    const forcedList = searchQuery.trim().length > 0;
    Animated.spring(tabAnim, {
      toValue: forcedList || viewMode === "list" ? 1 : 0,
      useNativeDriver: false,
      bounciness: 4,
      speed: 16,
    }).start();
  }, [viewMode, searchQuery, tabAnim]);

  const handleToggleLayout = (e: LayoutChangeEvent) => {
    // mirror CommunityScreen: total width minus horizontal padding (4 on each side)
    setTabSwitchInnerWidth(e.nativeEvent.layout.width - 8);
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const hasActiveSearch = trimmedQuery.length > 0;
  const effectiveViewMode: SpotsViewMode = hasActiveSearch ? "list" : viewMode;
  const activeFilterCount = countActiveFilters(filters);

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

    if (filters.mapReadyOnly) {
      next = next.filter((spot) => getSpotCoordinates(spot));
    }

    if (filters.nearbyOnly && userLocation) {
      next = next.filter((spot) => {
        const coords = getSpotCoordinates(spot);
        if (!coords) {
          return false;
        }

        return calculateDistanceKm(userLocation, coords) <= 10;
      });
    }

    if (filters.minRating > 0) {
      next = next.filter((spot) => {
        const rating = toNumber(spot.rating);
        return rating !== null && rating >= filters.minRating;
      });
    }

    const amenityChecks: { active: boolean; key: keyof StudySpot }[] = [
      { active: filters.amenities.wifi, key: "wifi_available" },
      { active: filters.amenities.outlets, key: "outlets_available" },
      { active: filters.amenities.foodDrink, key: "food_drink_allowed" },
      { active: filters.amenities.whiteboards, key: "whiteboards_available" },
      { active: filters.amenities.groupWork, key: "group_work_friendly" },
    ];
    const activeAmenityChecks = amenityChecks.filter((check) => check.active);
    if (activeAmenityChecks.length > 0) {
      next = next.filter((spot) =>
        activeAmenityChecks.every((check) => spot[check.key] === true),
      );
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
  }, [filters, spots, trimmedQuery, userLocation]);

  const mapSpots = useMemo(
    () => filteredSpots.filter((spot) => getSpotCoordinates(spot)),
    [filteredSpots],
  );

  // useCallback so the captured reference is stable across renders.
  // The memoized `mapLayer` below has this in its deps array, so any time
  // `userLocation` actually changes we want a fresh closure — but on a
  // map<->list toggle nothing in the deps changes and the layer is reused.
  const centerOnUserLocation = useCallback(() => {
    if (!userLocation || !mapRef.current) {
      return;
    }

    setActiveSpotId(null);
    mapRef.current.animateToRegion({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: DEFAULT_USER_REGION_DELTA,
      longitudeDelta: DEFAULT_USER_REGION_DELTA,
    });
  }, [userLocation]);

  // MapView calls this every time the visible region settles (after a
  // pan, a pinch, or a programmatic animateToRegion / fitToCoordinates).
  // We compare the new center to the user's location and flip
  // `isMapCenteredOnUser` accordingly so the recenter button can switch
  // between secondary (already centered) and primary (off-center → tap
  // to recenter). `userLocation` changes once (on permission grant) so
  // including it in deps doesn't meaningfully churn the memoized
  // `mapLayer` below.
  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      if (!userLocation) {
        setIsMapCenteredOnUser(false);
        return;
      }
      const distance = calculateDistanceKm(userLocation, {
        latitude: region.latitude,
        longitude: region.longitude,
      });
      // ~200m tolerance — close enough that the visible map still shows
      // the user. Anything beyond that and the recenter button announces
      // itself in primary blue.
      setIsMapCenteredOnUser(distance < 0.2);
    },
    [userLocation],
  );

  useEffect(() => {
    if (
      effectiveViewMode !== "map" ||
      Platform.OS === "web" ||
      !userLocation ||
      !mapRef.current ||
      activeSpotId
    ) {
      return;
    }

    const timeoutId = setTimeout(() => {
      centerOnUserLocation();
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [activeSpotId, effectiveViewMode, userLocation]);

  const cardWidth = Math.min(width * 0.78, 320);

  const focusSpotOnMap = useCallback((spot: StudySpot) => {
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
  }, []);

  const requestViewOnMap = useCallback(
    (spot: StudySpot) => {
      if (searchQuery.length > 0) {
        setSearchQuery("");
      }
      setActiveSpotId(spot.id);
      setPendingFocusSpotId(spot.id);
      setViewMode("map");
    },
    [searchQuery.length, setViewMode],
  );

  useEffect(() => {
    if (
      !pendingFocusSpotId ||
      effectiveViewMode !== "map" ||
      Platform.OS === "web"
    ) {
      return;
    }

    const spot = filteredSpots.find((item) => item.id === pendingFocusSpotId);
    if (!spot) {
      setPendingFocusSpotId(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      focusSpotOnMap(spot);
      setPendingFocusSpotId(null);
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [pendingFocusSpotId, effectiveViewMode, filteredSpots]);

  // ── Live mirrors for the filter-change effect ─────────────────────────
  // We want the effect below to fire ONLY when `filters` changes, not on
  // every silent 5s refetch that mutates `spots` (and therefore
  // `mapSpots`/`filteredSpots`). To do that we mirror the values the
  // effect needs into refs that update on every render, and depend only
  // on `filters` in the dep array.
  const effectiveViewModeRef = useRef(effectiveViewMode);
  effectiveViewModeRef.current = effectiveViewMode;
  const mapSpotsRef = useRef(mapSpots);
  mapSpotsRef.current = mapSpots;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const mapCarouselHeightRef = useRef(mapCarouselHeight);
  mapCarouselHeightRef.current = mapCarouselHeight;

  // React to filter changes:
  //   • List view → smoothly scroll back to the top so the user lands on
  //     the most relevant (closest / highest-rated) match after refining.
  //   • Map view  → re-fit the camera around every filtered spot that
  //     sits within 50km of the user, so the new result set is fully
  //     visible without manual panning. User location is included in the
  //     fit so they can always orient themselves.
  useEffect(() => {
    // Skip the initial mount — only fire on real filter mutations.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (effectiveViewModeRef.current === "list") {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }

    if (Platform.OS === "web") return;
    const ref = mapRef.current;
    if (!ref) return;

    const RADIUS_KM = 50;
    const currentMapSpots = mapSpotsRef.current;
    const currentUserLocation = userLocationRef.current;

    const candidateCoords = currentMapSpots
      .map((spot) => {
        const coords = getSpotCoordinates(spot);
        if (!coords) return null;
        if (
          currentUserLocation &&
          calculateDistanceKm(currentUserLocation, coords) > RADIUS_KM
        ) {
          return null;
        }
        return coords;
      })
      .filter(
        (c): c is { latitude: number; longitude: number } => c !== null,
      );

    if (candidateCoords.length === 0) return;

    const coordsForFit = currentUserLocation
      ? [currentUserLocation, ...candidateCoords]
      : candidateCoords;

    if (coordsForFit.length === 1) {
      ref.animateToRegion({
        ...coordsForFit[0],
        latitudeDelta: DEFAULT_USER_REGION_DELTA * 2,
        longitudeDelta: DEFAULT_USER_REGION_DELTA * 2,
      });
      return;
    }

    // Leave enough room at the bottom for the spot carousel so no card
    // ends up obscuring a marker we just zoomed to.
    ref.fitToCoordinates(coordsForFit, {
      edgePadding: {
        top: 80,
        right: 40,
        bottom: mapCarouselHeightRef.current + 40,
        left: 40,
      },
      animated: true,
    });
  }, [filters]);

  // `showViewOnMap` is now keyed off `compact` instead of `effectiveViewMode`.
  // The carousel cards always pass `compact=true`, the list cards never do,
  // so the behavior is identical to the previous check — but the renderer
  // no longer depends on which mode the screen is in, which means the
  // memoized layers below don't get invalidated on toggle.
  const renderSpotCard = useCallback(
    (spot: StudySpot, compact = false) => {
      const coords = getSpotCoordinates(spot);
      const distanceLabel =
        coords && userLocation
          ? formatDistance(calculateDistanceKm(userLocation, coords))
          : null;
      const metaLabel =
        distanceLabel ??
        (coords ? "Tap to focus on map" : "No coordinates yet");

      return (
        <SpotCard
          spot={spot}
          metaLabel={metaLabel}
          hasCoordinates={Boolean(coords)}
          compact={compact}
          active={activeSpotId === spot.id}
          width={compact ? cardWidth : undefined}
          showViewOnMap={!compact && Boolean(coords)}
          onPress={() => {
            setActiveSpotId(spot.id);
            navigation.navigate("SpotDetail", { spot });
          }}
          onViewOnMap={() => requestViewOnMap(spot)}
        />
      );
    },
    [activeSpotId, cardWidth, navigation, requestViewOnMap, userLocation],
  );

  // ── Active-filter chip row ────────────────────────────────────────────
  // Render a one-line, horizontally-scrollable summary of every filter the
  // user currently has on. Each chip taps to remove just that one filter
  // (the user can still hit "Reset" inside the modal to clear all).
  //
  // The descriptors are computed via `useMemo` keyed on `filters` so the
  // chip array (and therefore the chip row's children references) is
  // stable across unrelated re-renders.
  const clearFilterByKey = useCallback(
    (key: string) => {
      setFilters((current) => {
        if (key === "nearbyOnly") {
          return { ...current, nearbyOnly: false };
        }
        if (key === "mapReadyOnly") {
          return { ...current, mapReadyOnly: false };
        }
        if (key === "minRating") {
          return { ...current, minRating: 0 };
        }
        if (key.startsWith("amenity:")) {
          const amenityKey = key.slice(
            "amenity:".length,
          ) as keyof SpotFiltersValue["amenities"];
          return {
            ...current,
            amenities: { ...current.amenities, [amenityKey]: false },
          };
        }
        return current;
      });
    },
    [],
  );

  type ActiveChip = {
    key: string;
    label: string;
    Icon: typeof MapPin;
  };

  const activeFilterChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    if (filters.nearbyOnly) {
      chips.push({ key: "nearbyOnly", label: "Within 10 km", Icon: MapPin });
    }
    if (filters.mapReadyOnly) {
      chips.push({ key: "mapReadyOnly", label: "On map", Icon: MapPin });
    }
    if (filters.minRating > 0) {
      chips.push({
        key: "minRating",
        label: `${filters.minRating}+ stars`,
        Icon: Star,
      });
    }
    if (filters.amenities.wifi) {
      chips.push({ key: "amenity:wifi", label: "Wi-Fi", Icon: Wifi });
    }
    if (filters.amenities.outlets) {
      chips.push({ key: "amenity:outlets", label: "Outlets", Icon: Zap });
    }
    if (filters.amenities.foodDrink) {
      chips.push({
        key: "amenity:foodDrink",
        label: "Food & Drinks",
        Icon: Coffee,
      });
    }
    if (filters.amenities.whiteboards) {
      chips.push({
        key: "amenity:whiteboards",
        label: "Whiteboards",
        Icon: Presentation,
      });
    }
    if (filters.amenities.groupWork) {
      chips.push({
        key: "amenity:groupWork",
        label: "Group Friendly",
        Icon: Users,
      });
    }
    return chips;
  }, [filters]);

  // The map subtree (MapView + markers + recenter button + bottom carousel)
  // is wrapped in useMemo with deps that intentionally DO NOT include
  // `viewMode`/`effectiveViewMode`. When the user flips the segmented
  // control React sees the SAME element reference here and skips the entire
  // reconciliation of MapView, every Marker, and the carousel FlatList.
  // The hidden layer is taken out of layout via `display: 'none'` below,
  // so it costs nothing visually either.
  const mapLayer = useMemo(
    () => (
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
              latitudeDelta: DEFAULT_USER_REGION_DELTA,
              longitudeDelta: DEFAULT_USER_REGION_DELTA,
            }}
            showsUserLocation
            showsMyLocationButton={false}
            showsPointsOfInterest={false}
            showsCompass={false}
            showsBuildings={false}
            showsTraffic={false}
            showsIndoors={false}
            toolbarEnabled={false}
            onRegionChangeComplete={handleRegionChangeComplete}
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
                  onPress={() => {
                    setActiveSpotId(spot.id);
                    navigation.navigate("SpotDetail", { spot });
                  }}
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
          style={[styles.carouselWrapper, { bottom: 6 }]}
          pointerEvents="box-none"
          onLayout={(e) => setMapCarouselHeight(e.nativeEvent.layout.height)}
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
    ),
    [
      activeSpotId,
      filteredSpots.length,
      handleRegionChangeComplete,
      mapCarouselHeight,
      mapSpots,
      navigation,
      renderSpotCard,
      userLocation,
      width,
    ],
  );

  // Same idea for the list. Toggling map<->list does not invalidate this
  // memo, so the FlatList and every visible SpotCard inside it are reused
  // by reference and React performs zero reconciliation work on toggle.
  const listLayer = useMemo(
    () => (
      <FlatList
        ref={listRef}
        data={filteredSpots}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarHeight + 24 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => renderSpotCard(item)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleManualRefresh()}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyListState}>
            <Text style={styles.stateText}>
              No spots match your search right now.
            </Text>
          </View>
        }
      />
    ),
    [filteredSpots, handleManualRefresh, refreshing, renderSpotCard, tabBarHeight],
  );

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
          {(() => {
            const tabWidth = Math.max(0, (tabSwitchInnerWidth - 4) / 2);
            const pillTranslateX = tabAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, tabWidth + 4],
            });
            const mapTextColor = tabAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ["#ffffff", Colors.dark],
            });
            const listTextColor = tabAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [Colors.dark, "#ffffff"],
            });

            // Mirror of CommunityScreen's Communities/Events toggle: a
            // single gray wrap with a blue primary pill that slides
            // between two text-only `Pressable`s. Text color crossfades
            // via interpolation on the same `tabAnim` value so the
            // whole control is driven by exactly one animated node.
            return (
              <View style={styles.tabSwitchWrap} onLayout={handleToggleLayout}>
                {tabWidth > 0 ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.tabSwitchPill,
                      {
                        width: tabWidth,
                        transform: [{ translateX: pillTranslateX }],
                      },
                    ]}
                  />
                ) : null}
                <Pressable
                  style={styles.tabSwitchBtn}
                  onPress={() => setViewMode("map")}
                >
                  <Animated.Text
                    style={[styles.tabSwitchTx, { color: mapTextColor }]}
                  >
                    Map
                  </Animated.Text>
                </Pressable>
                <Pressable
                  style={styles.tabSwitchBtn}
                  onPress={() => setViewMode("list")}
                >
                  <Animated.Text
                    style={[styles.tabSwitchTx, { color: listTextColor }]}
                  >
                    List
                  </Animated.Text>
                </Pressable>
              </View>
            );
          })()}

          <View style={styles.toolbarTrailing}>
            <Button
              size="sm"
              icon={<Filter size={16} color={Colors.dark} />}
              variant="secondary"
              onPress={() => setFiltersOpen(true)}
            />
            <Button
              size="sm"
              label="Add Spot"
              variant="accent"
              onPress={() => {
                if (!profile?.userProfile?.id) {
                  Alert.alert(
                    "Sign in",
                    "Sign in or create an account to list a study spot.",
                  );
                  return;
                }
                navigation.navigate("CreateSpot");
              }}
            />
          </View>
        </View>
      </View>

      {activeFilterChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activeFiltersRow}
          style={styles.activeFiltersWrap}
        >
          {activeFilterChips.map(({ key, label, Icon }) => (
            <Pressable
              key={key}
              onPress={() => clearFilterByKey(key)}
              style={styles.activeFilterChip}
              hitSlop={6}
            >
              <Icon size={12} color="#ffffff" strokeWidth={2.4} />
              <Text style={styles.activeFilterChipLabel}>{label}</Text>
              <X size={12} color="#ffffff" strokeWidth={2.6} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <SpotFiltersModal
        visible={filtersOpen}
        value={filters}
        hasUserLocation={Boolean(userLocation)}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
        onReset={() => setFilters(DEFAULT_SPOT_FILTERS)}
      />

      {spotsLoading && spots.length === 0 ? (
        <SkeletonList
          count={effectiveViewMode === "map" ? 3 : 5}
          style={styles.listContent}
          row={
            <SkeletonCard style={styles.spotSkeletonCard}>
              <SkeletonBox width="72%" height={18} radius={9} />
              <SkeletonBox width="92%" height={14} radius={7} />
              <SkeletonBox width="56%" height={13} radius={7} />
            </SkeletonCard>
          }
        />
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
      ) : (
        // Both layers stay mounted (so MapView is never re-initialized).
        // We hide the inactive one with `display: 'none'` which removes it
        // from RN's layout/paint pipeline — no fade, no opacity animation,
        // no JS-driven per-frame work on toggle. Because each layer's JSX
        // comes from `useMemo` above with deps that exclude `viewMode`,
        // React reuses the exact same element references on toggle and
        // skips reconciliation of every Marker / SpotCard underneath.
        <View style={styles.contentArea}>
          <View
            style={[
              StyleSheet.absoluteFill,
              effectiveViewMode === "map" ? null : styles.hiddenLayer,
            ]}
          >
            {mapLayer}
            {/* Recenter button lives OUTSIDE the memoized mapLayer so its
                variant can flip on region changes without invalidating
                MapView/markers. The wrapper's absolute positioning keeps
                it pinned just above the spot carousel. */}
            <View
              style={[
                styles.mapRecenterButtonContainer,
                { bottom: mapCarouselHeight + 12 },
              ]}
            >
              <Button
                size="sm"
                icon={
                  <LocateIcon
                    size={16}
                    color={isMapCenteredOnUser ? Colors.dark : "#ffffff"}
                  />
                }
                variant={isMapCenteredOnUser ? "secondary" : "default"}
                onPress={centerOnUserLocation}
                disabled={!userLocation}
              />
            </View>
          </View>
          <View
            style={[
              StyleSheet.absoluteFill,
              effectiveViewMode === "list" ? null : styles.hiddenLayer,
            ]}
          >
            {listLayer}
          </View>
        </View>
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
    paddingBottom: 12,
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
    justifyContent: "space-between",
    gap: 10,
  },
  toolbarTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // ── Active filter chips ──────────────────────────────────────────────
  // A horizontally-scrollable row that appears just under the toolbar
  // whenever any filter is on. Each chip is an accent-tinted pill with
  // its own X — tapping the chip removes only that filter.
  activeFiltersWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexGrow: 0,
  },
  activeFiltersRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 16,
  },
  activeFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  activeFilterChipLabel: {
    color: "#ffffff",
    fontFamily: Fonts.gabarito.medium,
    fontSize: 12,
  },
  // ── Map / List segmented toggle ────────────────────────────────────────
  // Ported directly from CommunityScreen's Communities/Events toggle so
  // both surfaces look + animate identically. Only addition is `flex: 1`
  // so the control fills the available toolbar space alongside the
  // trailing Filter / Add Spot buttons.
  tabSwitchWrap: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    padding: 4,
    gap: 4,
    position: "relative",
  },
  tabSwitchBtn: {
    flex: 1,
    // Sized so the segmented control's total height (2px borders + 8px
    // wrap padding + 28px button) equals 38px, matching the layout
    // footprint of the adjacent `<Button size="sm" />` filter button
    // (paddingV 8*2 + icon 16 + border 1.25*2 + 4 PRESS_DEPTH = 38.5).
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  tabSwitchPill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: Colors.primary,
    borderRadius: 6,
  },
  tabSwitchTx: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
  },
  iconActionButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },
  iconActionButtonActive: {
    backgroundColor: Colors.dark,
    borderColor: Colors.dark,
  },
  iconActionButtonDisabled: {
    opacity: 0.45,
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.light,
  },
  filterBadgeLabel: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 10,
    lineHeight: 12,
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
  contentArea: {
    flex: 1,
  },
  hiddenLayer: {
    display: "none",
  },
  mapContainer: {
    flex: 1,
  },
  mapRecenterButtonContainer: {
    position: "absolute",
    right: 12,
    zIndex: 5,
  },
  carouselWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  carouselContent: {
    paddingHorizontal: 6,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  spotSkeletonCard: {
    gap: 12,
    padding: 16,
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
