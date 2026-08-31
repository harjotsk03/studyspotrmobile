import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import {
  useFocusEffect,
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import type { ComponentType } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import {
  ArrowLeft,
  Bookmark,
  ChevronRight,
  Clock3,
  Coffee,
  Edit3,
  EllipsisVertical,
  Flag,
  Image as ImageIcon,
  MapPin,
  MessageSquarePlus,
  Plug,
  Presentation,
  Share2,
  Star,
  Trash2,
  UserRound,
  UsersRound,
  Wifi,
  X,
} from "lucide-react-native";
import ActionOptionsSheet, {
  ConfirmActionModal,
  type ActionOption,
  type AnchorRect,
} from "../components/ActionOptionsSheet";
import ReportConfirmModal from "../components/ReportConfirmModal";
import ShareToFriendsSheet from "../components/ShareToFriendsSheet";
import SpotReviewComposerModal, {
  type ComposerMode,
} from "../components/SpotReviewComposerModal";
import Button from "../components/Button";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import type { StudySpot } from "../context/SpotsContext";
import { useSpots } from "../context/SpotsContext";
import {
  fetchSpotById,
  fetchReviewsBySpot,
  deleteReviewJson,
  deleteSpotJson,
  spotReviewPhotoUrls,
  spotReviewPrimaryId,
  spotReviewUserProfilePhoto,
  spotReviewViewerUserId,
  type SpotReview,
} from "../utils/spotsApi";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import { calculateDistanceKm } from "../utils/calculateDistanceKm";
import { formatDistance } from "../utils/formatDistance";
import { getSpotCoordinates } from "../utils/getSpotCoordinates";
import { getSpotDescription } from "../utils/getSpotDescription";
import { getSpotTitle } from "../utils/getSpotTitle";
import { isSpotAlwaysOpen } from "../utils/spotHours";
import { toNumber } from "../utils/toNumber";
import type { RootStackParamList, SpotsStackParamList } from "../types/navigation";

type Props =
  | NativeStackScreenProps<SpotsStackParamList, "SpotDetail">
  | NativeStackScreenProps<RootStackParamList, "SpotViewer">;

const HERO_HEIGHT = 330;

function formatRatingNumber(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return parsed.toFixed(1);
}

function formatReviewCount(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null || parsed <= 0) return null;
  return Math.round(parsed);
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

function noiseChipLabel(raw: string) {
  const trimmed = raw.trim();
  if (/zone$/i.test(trimmed)) return trimmed;
  return `${trimmed} zone`;
}

function amenityOn(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

type SvgIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const AMENITIES: {
  label: string;
  Icon: ComponentType<SvgIconProps>;
  read: (s: StudySpot) => unknown;
}[] = [
  {
    label: "Food allowed",
    Icon: Coffee,
    read: (s) => s.food_drink_allowed,
  },
  {
    label: "Wi-Fi available",
    Icon: Wifi,
    read: (s) => s.wifi_available,
  },
  {
    label: "Outlets available",
    Icon: Plug,
    read: (s) => s.outlets_available,
  },
  {
    label: "Whiteboards available",
    Icon: Presentation,
    read: (s) => s.whiteboards_available,
  },
  {
    label: "Group work friendly",
    Icon: UsersRound,
    read: (s) => s.group_work_friendly,
  },
];

function parseClockMinutes(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const match = raw
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) {
    return null;
  }
  if (meridiem === "AM") {
    if (hours === 12) hours = 0;
  } else if (meridiem === "PM") {
    if (hours < 12) hours += 12;
  }
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

function formatClockLabel(raw: unknown): string | null {
  const mins = parseClockMinutes(raw);
  if (mins === null) {
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
  const hours24 = Math.floor(mins / 60);
  const minutes = mins % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function isOpenNow(openRaw: unknown, closeRaw: unknown): boolean | null {
  const open = parseClockMinutes(openRaw);
  const close = parseClockMinutes(closeRaw);
  if (open === null || close === null) return null;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  if (close === open) return true;
  if (close > open) return current >= open && current < close;
  return current >= open || current < close;
}

function hoursUntilClose(closeRaw: unknown): number | null {
  const close = parseClockMinutes(closeRaw);
  if (close === null) return null;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  let remaining = close - current;
  if (remaining <= 0) remaining += 24 * 60;
  const hours = Math.round(remaining / 60);
  return hours >= 1 ? hours : null;
}

function mapsUrlForSpot(spot: StudySpot): string | null {
  const coords = getSpotCoordinates(spot);
  const address =
    typeof spot.address === "string" ? spot.address.trim() : "";
  if (coords) {
    const dest = `${coords.latitude},${coords.longitude}`;
    return Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${encodeURIComponent(dest)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  }
  if (address) {
    const query = encodeURIComponent(address);
    return Platform.OS === "ios"
      ? `http://maps.apple.com/?q=${query}`
      : `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  return null;
}

function formatReviewDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ReviewStars({ value }: { value: number }) {
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <View style={styles.reviewStars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          color={i <= n ? Colors.accent : "#ddd"}
          fill={i <= n ? Colors.accent : "transparent"}
          strokeWidth={2}
        />
      ))}
    </View>
  );
}

function normalizeSpotGalleryUri(uri: string): string {
  const t = uri.trim();
  if (!t) return "";
  return encodeURI(t);
}

/** Single photo in the spot gallery carousel / lightbox (deduped by URI). */
type SpotGalleryItem = {
  uri: string;
  contributorName: string;
  roleLabel: string;
  /** Listing description excerpt or full review text */
  caption: string | null;
};

function listingCaptionFromSpot(spot: StudySpot): string | null {
  const d = spot.description;
  if (typeof d !== "string" || !d.trim()) return null;
  const t = d.trim();
  return t.length > 320 ? `${t.slice(0, 317)}…` : t;
}

function reviewAuthorDisplayName(r: SpotReview): string {
  const u = r.user;
  if (u && typeof u === "object") {
    const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    if (full) return full;
    if (typeof u.username === "string" && u.username.trim()) {
      return u.username.trim();
    }
  }
  if (typeof r.user_name === "string" && r.user_name.trim()) {
    return r.user_name.trim();
  }
  return "Reviewer";
}

/** Spot hero image first, then review attachments in review order; deduped by normalized URI. */
function buildSpotGalleryItems(
  spot: StudySpot,
  reviews: SpotReview[],
): SpotGalleryItem[] {
  const seen = new Set<string>();
  const out: SpotGalleryItem[] = [];

  const push = (raw: string, meta: Omit<SpotGalleryItem, "uri">): void => {
    const n = normalizeSpotGalleryUri(raw);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push({ uri: n, ...meta });
  };

  if (typeof spot.image_url === "string" && spot.image_url.trim()) {
    const creator =
      typeof spot.created_by_name === "string" && spot.created_by_name.trim()
        ? spot.created_by_name.trim()
        : "StudySpotr member";
    push(spot.image_url, {
      contributorName: creator,
      roleLabel: "Listing photo",
      caption: listingCaptionFromSpot(spot),
    });
  }

  for (const r of reviews) {
    const name = reviewAuthorDisplayName(r);
    const bodyRaw =
      typeof r.content === "string" && r.content.trim()
        ? r.content.trim()
        : null;
    for (const u of spotReviewPhotoUrls(r)) {
      push(u, {
        contributorName: name,
        roleLabel: "Review photo",
        caption: bodyRaw,
      });
    }
  }

  return out;
}

export default function SpotDetailScreen({ route, navigation }: Props) {
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { token, profile } = useAuth();
  const { refetchSpots } = useSpots();
  const user = profile?.userProfile;

  const spotId = route.params.spot.id;
  const [spot, setSpot] = useState<StudySpot>(route.params.spot);
  const [reviews, setReviews] = useState<SpotReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [spotRefreshing, setSpotRefreshing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("create");
  const [editingReview, setEditingReview] = useState<SpotReview | null>(null);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxMountKey, setLightboxMountKey] = useState(0);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [showSpotReportModal, setShowSpotReportModal] = useState(false);
  const [spotOptionsOpen, setSpotOptionsOpen] = useState(false);
  const [spotMenuAnchor, setSpotMenuAnchor] = useState<AnchorRect | null>(null);
  const [reviewMenuReview, setReviewMenuReview] = useState<SpotReview | null>(
    null,
  );
  const [reviewMenuAnchor, setReviewMenuAnchor] = useState<AnchorRect | null>(
    null,
  );
  const [confirmDeleteSpot, setConfirmDeleteSpot] = useState(false);
  const [confirmDeleteReview, setConfirmDeleteReview] =
    useState<SpotReview | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const spotMenuWrapRef = useRef<View>(null);
  const reviewMenuWraps = useRef(new Map<string, View | null>());
  // TODO: wire to saved-spots API
  const [saved, setSaved] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const lightboxListRef = useRef<FlatList<SpotGalleryItem>>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const sheetOffsetY = useRef(0);
  const reviewsSectionY = useRef(0);
  const heroParallaxStyle = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [0, HERO_HEIGHT],
          outputRange: [0, HERO_HEIGHT],
          extrapolate: "clamp",
        }),
      },
    ],
  };

  const galleryItems = useMemo(
    () => buildSpotGalleryItems(spot, reviews),
    [spot, reviews],
  );

  const openSpotGalleryAt = useCallback(
    (index: number) => {
      if (galleryItems.length === 0) return;
      const clamped = Math.max(0, Math.min(index, galleryItems.length - 1));
      setLightboxIndex(clamped);
      setLightboxMountKey((k) => k + 1);
      setLightboxOpen(true);
    },
    [galleryItems.length],
  );

  const openSpotGalleryForUri = useCallback(
    (rawUri: string) => {
      const n = normalizeSpotGalleryUri(rawUri);
      const idx = galleryItems.findIndex((g) => g.uri === n);
      if (idx >= 0) openSpotGalleryAt(idx);
    },
    [galleryItems, openSpotGalleryAt],
  );

  const closeSpotGallery = useCallback(() => setLightboxOpen(false), []);

  const onHeroMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / windowWidth);
      setHeroSlideIndex(
        Math.max(0, Math.min(i, Math.max(0, galleryItems.length - 1))),
      );
    },
    [galleryItems.length, windowWidth],
  );

  const onLightboxMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / windowWidth);
      setLightboxIndex(
        Math.max(0, Math.min(i, Math.max(0, galleryItems.length - 1))),
      );
    },
    [galleryItems.length, windowWidth],
  );

  useEffect(() => {
    if (galleryItems.length === 0) {
      setHeroSlideIndex(0);
      return;
    }
    setHeroSlideIndex((prev) =>
      Math.min(prev, Math.max(0, galleryItems.length - 1)),
    );
  }, [galleryItems.length]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== "granted") return;

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
        if (!cancelled) setUserLocation(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const [fresh, list] = await Promise.all([
        fetchSpotById(spotId),
        fetchReviewsBySpot(spotId),
      ]);
      if (fresh) setSpot(fresh);
      setReviews(list);
    } catch (e) {
      console.warn(e);
    } finally {
      setReviewsLoading(false);
    }
  }, [spotId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const onRefresh = async () => {
    setSpotRefreshing(true);
    try {
      await loadData();
    } finally {
      setSpotRefreshing(false);
    }
  };

  const title = getSpotTitle(spot);
  const description = getSpotDescription(spot);
  const ratingLabel = formatRatingNumber(spot.rating);
  const reviewCount =
    formatReviewCount(spot.rating_count) ??
    (reviews.length > 0 ? reviews.length : null);
  const noiseLabel = getNoiseLabel(spot);
  const lightingLabel =
    typeof spot.lighting === "string" ? spot.lighting.trim() : "";
  const tablesLabel = typeof spot.tables === "string" ? spot.tables.trim() : "";
  const vibeCells = [
    noiseLabel ? { caption: "Noise", value: noiseLabel } : null,
    lightingLabel ? { caption: "Light", value: lightingLabel } : null,
    tablesLabel ? { caption: "Seating", value: tablesLabel } : null,
  ].filter((cell): cell is { caption: string; value: string } => cell !== null);

  const address =
    typeof spot.address === "string" ? spot.address.trim() : "";
  const alwaysOpen = isSpotAlwaysOpen(spot);
  const openLabel = formatClockLabel(spot.open_time);
  const closeLabel = formatClockLabel(spot.close_time);
  const hoursLabel = alwaysOpen
    ? "Open 24 hours"
    : [openLabel, closeLabel].filter(Boolean).join(" – ");
  const openState = alwaysOpen ? true : isOpenNow(spot.open_time, spot.close_time);
  const closesIn =
    alwaysOpen || openState !== true ? null : hoursUntilClose(spot.close_time);
  const spotCoords = getSpotCoordinates(spot);
  const distanceLabel =
    userLocation && spotCoords
      ? formatDistance(calculateDistanceKm(userLocation, spotCoords))
      : null;

  const amenityChips = useMemo(
    () => AMENITIES.filter((item) => amenityOn(item.read(spot))),
    [spot],
  );

  const isSpotOwner = Boolean(
    user?.id && spot.created_by_id && user.id === spot.created_by_id,
  );

  const toggleSave = () => {
    // TODO: wire to saved-spots API
    setSaved((prev) => !prev);
  };

  const openDirections = () => {
    const url = mapsUrlForSpot(spot);
    if (!url) {
      Alert.alert("Directions", "No address or coordinates for this spot.");
      return;
    }
    void Linking.openURL(url);
  };

  const openComposerCreate = () => {
    if (!user?.id) {
      Alert.alert("Sign in", "Sign in to write a review.");
      return;
    }
    setComposerMode("create");
    setEditingReview(null);
    setComposerOpen(true);
  };

  const openComposerEdit = (r: SpotReview) => {
    if (!user?.id) return;
    setComposerMode("edit");
    setEditingReview(r);
    setComposerOpen(true);
  };

  const measureView = (
    node: View | null,
    onDone: (rect: AnchorRect | null) => void,
  ) => {
    if (!node) {
      onDone(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      onDone({ x, y, width, height });
    });
  };

  const openSpotMenu = () => {
    measureView(spotMenuWrapRef.current, (rect) => {
      setSpotMenuAnchor(rect);
      setSpotOptionsOpen(true);
    });
  };

  const openReviewMenu = (r: SpotReview, key: string) => {
    measureView(reviewMenuWraps.current.get(key) ?? null, (rect) => {
      setReviewMenuAnchor(rect);
      setReviewMenuReview(r);
    });
  };

  const goEditSpot = () => {
    if (route.name === "SpotViewer") {
      rootNavigation.navigate("MainTabs", {
        screen: "Spots",
        params: { screen: "EditSpot", params: { spot } },
      });
      navigation.goBack();
      return;
    }
    (navigation as NativeStackNavigationProp<SpotsStackParamList>).navigate(
      "EditSpot",
      { spot },
    );
  };

  const handleDeleteSpot = async () => {
    if (!user?.id) return;
    setDeleteLoading(true);
    try {
      await deleteSpotJson({
        spot_id: spotId,
        user_id: user.id,
        deleting_user_points: true,
      });
      await refetchSpots();
      setConfirmDeleteSpot(false);
      navigation.goBack();
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not delete spot.",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteReview = async () => {
    const r = confirmDeleteReview;
    const rid = r ? spotReviewPrimaryId(r) : null;
    if (!rid || !user?.id) return;
    setDeleteLoading(true);
    try {
      await deleteReviewJson({
        review_id: rid,
        spot_id: spotId,
        user_id: user.id,
        deleting_user_points: true,
      });
      await loadData();
      await refetchSpots();
      setConfirmDeleteReview(null);
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not delete review.",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const spotOptions: ActionOption[] = [
    {
      key: "share",
      icon: Share2,
      label: "Share",
      onPress: () => setShareSheetOpen(true),
    },
    ...(isSpotOwner && user?.id
      ? [
          {
            key: "edit",
            icon: Edit3,
            label: "Edit spot",
            onPress: goEditSpot,
          },
          {
            key: "delete",
            icon: Trash2,
            label: "Delete spot",
            destructive: true,
            onPress: () => setConfirmDeleteSpot(true),
          },
        ]
      : token
        ? [
            {
              key: "report",
              icon: Flag,
              label: "Report spot",
              destructive: true,
              onPress: () => setShowSpotReportModal(true),
            },
          ]
        : []),
  ];

  const reviewOptions: ActionOption[] = reviewMenuReview
    ? [
        {
          key: "edit",
          icon: Edit3,
          label: "Edit review",
          onPress: () => openComposerEdit(reviewMenuReview),
        },
        {
          key: "delete",
          icon: Trash2,
          label: "Delete review",
          destructive: true,
          onPress: () => setConfirmDeleteReview(reviewMenuReview),
        },
      ]
    : [];

  const heroScrim = (
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(0,0,0,0.45)", "transparent", "rgba(0,0,0,0.18)"]}
      locations={[0, 0.18, 1]}
      style={StyleSheet.absoluteFill}
    />
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      <View
        pointerEvents="box-none"
        style={[
          styles.floatingOverlay,
          { top: insets.top + 12 },
        ]}
      >
        <Button
          size="icon"
          variant="secondary"
          icon={<ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />}
          onPress={() => navigation.goBack()}
        />
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        refreshControl={
          <RefreshControl
            refreshing={spotRefreshing}
            onRefresh={() => void onRefresh()}
            tintColor={Colors.accent}
          />
        }
      >
        {galleryItems.length > 0 ? (
          <View style={styles.heroCarouselWrap}>
            <Animated.View style={[styles.heroParallax, heroParallaxStyle]}>
              <FlatList
                data={galleryItems}
                horizontal
                pagingEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => `${item.uri}-${index}`}
                getItemLayout={(_, index) => ({
                  length: windowWidth,
                  offset: windowWidth * index,
                  index,
                })}
                onMomentumScrollEnd={onHeroMomentumEnd}
                renderItem={({ item, index }) => (
                  <Pressable
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`View spot photo ${index + 1} of ${galleryItems.length}`}
                    onPress={() => openSpotGalleryAt(index)}
                    style={{ width: windowWidth, height: HERO_HEIGHT }}
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={styles.heroSlideImage}
                      resizeMode="cover"
                    />
                  </Pressable>
                )}
              />
              {heroScrim}
              {galleryItems.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${heroSlideIndex + 1} of ${galleryItems.length}`}
                  onPress={() => openSpotGalleryAt(heroSlideIndex)}
                  style={styles.photoCounter}
                >
                  <ImageIcon size={13} color="#fff" />
                  <Text style={styles.photoCounterText}>
                    {heroSlideIndex + 1} / {galleryItems.length}
                  </Text>
                </Pressable>
              ) : null}
            </Animated.View>
          </View>
        ) : (
          <View style={styles.heroFallback}>
            <Animated.View
              style={[
                styles.heroParallax,
                styles.heroFallbackInner,
                heroParallaxStyle,
              ]}
            >
              <Text style={styles.heroInitial}>
                {title.charAt(0).toUpperCase()}
              </Text>
              {heroScrim}
            </Animated.View>
          </View>
        )}

        <View
          style={styles.sheet}
          onLayout={(e) => {
            sheetOffsetY.current = e.nativeEvent.layout.y;
          }}
        >
          {openState !== null || noiseLabel ? (
            <View style={styles.statusRow}>
              {openState !== null ? (
                <View
                  style={[
                    styles.statusChip,
                    openState ? styles.statusChipOpen : styles.statusChipClosed,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: openState ? "#16a34a" : "#6B7280",
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusChipText,
                      { color: openState ? "#166534" : "#6B7280" },
                    ]}
                  >
                    {openState ? "Open now" : "Closed"}
                  </Text>
                </View>
              ) : null}
              {noiseLabel ? (
                <View style={styles.noiseChip}>
                  <Text style={styles.noiseChipText}>
                    {noiseChipLabel(noiseLabel)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.name}>{title}</Text>

          {ratingLabel || reviewCount || distanceLabel ? (
            <View style={styles.metaRow}>
              {ratingLabel ? (
                <>
                  <Star
                    size={15}
                    color={Colors.accent}
                    fill={Colors.accent}
                  />
                  <Text style={styles.metaRating}>{ratingLabel}</Text>
                </>
              ) : null}
              {reviewCount ? (
                <Pressable
                  onPress={() =>
                    scrollRef.current?.scrollTo({
                      y: reviewsSectionY.current,
                      animated: true,
                    })
                  }
                >
                  <Text style={styles.metaReviews}>
                    ({reviewCount} reviews)
                  </Text>
                </Pressable>
              ) : null}
              {distanceLabel ? (
                <>
                  {(ratingLabel || reviewCount) ? (
                    <View style={styles.metaDot} />
                  ) : null}
                  <Text style={styles.metaDistance}>{distanceLabel}</Text>
                </>
              ) : null}
            </View>
          ) : null}

          {description ? (
            <Text style={styles.description}>{description}</Text>
          ) : null}

          {amenityChips.length > 0 ? (
            <View style={styles.amenityRow}>
              {amenityChips.map(({ Icon, label }) => (
                <View key={label} style={styles.amenityChipOn}>
                  <Icon size={16} color={Colors.primary} strokeWidth={2.2} />
                  <Text style={styles.amenityLabelOn}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {vibeCells.length > 0 ? (
            <View style={styles.vibeStrip}>
              {vibeCells.map((cell, index) => (
                <View
                  key={cell.caption}
                  style={[
                    styles.vibeCell,
                    index < vibeCells.length - 1 && styles.vibeCellDivider,
                  ]}
                >
                  <Text style={styles.vibeCaption}>{cell.caption}</Text>
                  <Text style={styles.vibeValue}>{cell.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {address || hoursLabel ? (
            <View style={styles.visitBlock}>
              {address ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open address in maps"
                  onPress={openDirections}
                  style={styles.visitRow}
                >
                  <View style={styles.visitTileAddress}>
                    <MapPin size={18} color={Colors.primary} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.visitValue} numberOfLines={1}>
                    {address}
                  </Text>
                  <ChevronRight size={18} color="#bbb" />
                </Pressable>
              ) : null}
              {hoursLabel ? (
                <View
                  style={[
                    styles.visitRow,
                    address ? styles.visitRowSpaced : undefined,
                  ]}
                >
                  <View style={styles.visitTileHours}>
                    <Clock3 size={18} color={Colors.accent} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.visitValue} numberOfLines={2}>
                    {hoursLabel}
                    {closesIn ? (
                      <Text style={styles.closesIn}>
                        {` · closes in ${closesIn}h`}
                      </Text>
                    ) : null}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {isSpotOwner ? (
            <View style={styles.ownerBadge}>
              <Text style={styles.ownerBadgeText}>Your listing</Text>
            </View>
          ) : null}

          <View
            style={styles.reviewsBlock}
            onLayout={(e) => {
              reviewsSectionY.current =
                sheetOffsetY.current + e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.reviewsHeader}>
              <Text style={styles.reviewsTitle}>Reviews</Text>
              <Text style={styles.reviewsTotal}>
                {reviewCount ?? reviews.length} total
              </Text>
            </View>
            {reviewsLoading && reviews.length === 0 ? (
              <ActivityIndicator style={styles.loader} color={Colors.accent} />
            ) : null}
            {reviews.length === 0 && !reviewsLoading ? (
              <Text style={styles.emptyReviews}>
                No reviews yet — be the first.
              </Text>
            ) : (
              reviews.map((r, idx) => {
                const rUserId = spotReviewViewerUserId(r);
                const mine = Boolean(user?.id && rUserId && user.id === rUserId);
                const canOpenReviewerProfile = Boolean(rUserId);
                const imgs = spotReviewPhotoUrls(r);
                const reviewerPhotoUri = spotReviewUserProfilePhoto(r);
                const rn =
                  typeof r.user_name === "string" ? r.user_name : "Reviewer";
                const ratingNum =
                  typeof r.rating === "number"
                    ? r.rating
                    : Number(r.rating) || 0;
                const dateLbl = formatReviewDate(r.created_at);

                // Build the same shape every other screen feeds to the
                // shared avatar utilities (PublicProfileScreen, FeedPostCard,
                // CommunityMembersScreen, etc.) so the initials + color are
                // computed consistently across the app — handling
                // "First Last" → "FL", single-word names, username/email
                // fallback, and a deterministic background color per user.
                const avatarUser = {
                  id: rUserId || r.user?.id || undefined,
                  first_name: r.user?.first_name ?? undefined,
                  last_name: r.user?.last_name ?? undefined,
                  username: r.user?.username ?? undefined,
                  name: rn,
                };

                return (
                  <View
                    key={spotReviewPrimaryId(r) ?? `rev-${idx}`}
                    style={[
                      styles.reviewRow,
                      idx === reviews.length - 1 && styles.reviewRowLast,
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${rn}'s profile`}
                      disabled={!canOpenReviewerProfile}
                      onPress={() => {
                        if (!rUserId) return;
                        rootNavigation.navigate("PublicProfile", {
                          userId: rUserId,
                        });
                      }}
                      style={({ pressed }) =>
                        canOpenReviewerProfile && pressed
                          ? styles.reviewerAvatarPressablePressed
                          : undefined
                      }
                    >
                      {reviewerPhotoUri ? (
                        <Image
                          source={{ uri: reviewerPhotoUri }}
                          style={styles.reviewerAvatar}
                        />
                      ) : (
                        <View
                          style={[
                            styles.reviewerAvatarFallback,
                            {
                              backgroundColor: getUserAvatarColor(avatarUser),
                            },
                          ]}
                        >
                          <Text style={styles.reviewerInitial}>
                            {getUserInitials(avatarUser)}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                    <View style={styles.reviewContent}>
                      <View style={styles.reviewNameRow}>
                        <Text style={styles.reviewerName} numberOfLines={1}>
                          {rn}
                        </Text>
                        <ReviewStars value={ratingNum} />
                        {mine ? (
                          <View
                            ref={(node) => {
                              const key = spotReviewPrimaryId(r) ?? `rev-${idx}`;
                              reviewMenuWraps.current.set(key, node);
                            }}
                            collapsable={false}
                            style={styles.reviewMenuButton}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              style={styles.reviewMenuIcon}
                              icon={
                                <EllipsisVertical
                                  size={18}
                                  color={Colors.dark}
                                />
                              }
                              onPress={() =>
                                openReviewMenu(
                                  r,
                                  spotReviewPrimaryId(r) ?? `rev-${idx}`,
                                )
                              }
                            />
                          </View>
                        ) : null}
                      </View>
                      {dateLbl ? (
                        <Text style={styles.reviewDate}>{dateLbl}</Text>
                      ) : null}
                      <Text style={styles.reviewBody}>
                        {typeof r.content === "string" ? r.content : ""}
                      </Text>
                      {imgs.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.reviewImagesScroll}
                        >
                          {imgs.map((uri) => (
                            <Pressable
                              key={uri}
                              accessibilityRole="imagebutton"
                              accessibilityLabel="View review photo full screen"
                              onPress={() => openSpotGalleryForUri(uri)}
                              style={styles.reviewThumbPressable}
                            >
                              <Image
                                source={{ uri }}
                                style={styles.reviewThumb}
                                resizeMode="cover"
                              />
                            </Pressable>
                          ))}
                        </ScrollView>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {spot.created_by_name ? (
            <View style={styles.addedByRow}>
              <UserRound size={16} color="#777" />
              <Text style={styles.addedByText}>
                Added by {spot.created_by_name}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.ScrollView>

      <View
        style={[
          styles.stickyBar,
          { paddingBottom: insets.bottom > 0 ? Math.max(insets.bottom - 20, 6) : 10 },
        ]}
      >
        <View style={styles.stickyPrimary}>
          <Button
            variant="default"
            fullWidth
            label="Write a review"
            icon={<MessageSquarePlus size={17} color="#fff" />}
            onPress={openComposerCreate}
          />
        </View>
        <Button
          variant="outline"
          size="icon"
          icon={
            <Bookmark
              size={18}
              color={saved ? Colors.accent : Colors.dark}
              fill={saved ? Colors.accent : "transparent"}
              strokeWidth={2.2}
            />
          }
          onPress={toggleSave}
        />
        <View ref={spotMenuWrapRef} collapsable={false}>
          <Button
            variant="outline"
            size="icon"
            icon={<EllipsisVertical size={18} color={Colors.dark} />}
            onPress={openSpotMenu}
          />
        </View>
      </View>

      <Modal
        visible={lightboxOpen && galleryItems.length > 0}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeSpotGallery}
      >
        <View style={[styles.lightboxRoot, { paddingTop: insets.top }]}>
          <View style={styles.lightboxTopBar}>
            <Text style={styles.lightboxCounter}>
              {lightboxIndex + 1} / {galleryItems.length}
            </Text>
            <TouchableOpacity
              onPress={closeSpotGallery}
              style={styles.lightboxCloseHit}
              accessibilityRole="button"
              accessibilityLabel="Close photo gallery"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <X size={26} color="#fff" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
          <FlatList
            ref={lightboxListRef}
            key={lightboxMountKey}
            data={galleryItems}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(
              lightboxIndex,
              Math.max(0, galleryItems.length - 1),
            )}
            keyExtractor={(item, index) => `${item.uri}-lb-${index}`}
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            onMomentumScrollEnd={onLightboxMomentumEnd}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                lightboxListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: false,
                });
              }, 60);
            }}
            renderItem={({ item }) => (
              <View style={[styles.lightboxPage, { width: windowWidth }]}>
                <View style={styles.lightboxImageStage}>
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.lightboxMainImage}
                    resizeMode="contain"
                  />
                </View>
                <View
                  style={[
                    styles.lightboxFooter,
                    { paddingBottom: Math.max(insets.bottom, 14) },
                  ]}
                >
                  <Text style={styles.lightboxContributor}>
                    {item.contributorName}
                  </Text>
                  {item.caption ? (
                    <>
                      <Text style={styles.lightboxCaptionEyebrow}>
                        {item.roleLabel === "Listing photo"
                          ? "About this spot"
                          : "Review"}
                      </Text>
                      <ScrollView
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        style={styles.lightboxReviewScroll}
                      >
                        <Text style={styles.lightboxReviewText}>
                          {item.caption}
                        </Text>
                      </ScrollView>
                    </>
                  ) : null}
                </View>
              </View>
            )}
            style={styles.lightboxPager}
          />
        </View>
      </Modal>

      <SpotReviewComposerModal
        visible={composerOpen}
        mode={composerMode}
        spotId={spotId}
        spotName={title}
        review={editingReview ?? undefined}
        currentUser={user ?? null}
        onClose={() => setComposerOpen(false)}
        onSuccess={async () => {
          await loadData();
          await refetchSpots();
        }}
      />

      <ActionOptionsSheet
        visible={spotOptionsOpen}
        onClose={() => setSpotOptionsOpen(false)}
        title="Spot options"
        anchor={spotMenuAnchor}
        options={spotOptions}
      />

      <ActionOptionsSheet
        visible={reviewMenuReview !== null}
        onClose={() => setReviewMenuReview(null)}
        title="Review options"
        anchor={reviewMenuAnchor}
        options={reviewOptions}
      />

      <ConfirmActionModal
        visible={confirmDeleteSpot}
        title="Delete this spot?"
        body="Reviews and photos will be removed. This cannot be undone."
        confirmLabel="Delete"
        loading={deleteLoading}
        onCancel={() => {
          if (!deleteLoading) setConfirmDeleteSpot(false);
        }}
        onConfirm={() => void handleDeleteSpot()}
      />

      <ConfirmActionModal
        visible={confirmDeleteReview !== null}
        title="Delete review?"
        body="This removes your review and updates the spot rating."
        confirmLabel="Delete"
        loading={deleteLoading}
        onCancel={() => {
          if (!deleteLoading) setConfirmDeleteReview(null);
        }}
        onConfirm={() => void handleDeleteReview()}
      />

      <ShareToFriendsSheet
        visible={shareSheetOpen}
        attachment={shareSheetOpen ? { kind: "spot", spot } : null}
        token={token}
        navigation={rootNavigation as unknown as NavigationProp<ParamListBase>}
        onClose={() => setShareSheetOpen(false)}
      />

      <ReportConfirmModal
        visible={showSpotReportModal}
        onClose={() => setShowSpotReportModal(false)}
        contentType="spot"
        contentId={spotId}
        contentLabel="Spot"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  floatingOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  content: {
    flex: 1,
  },
  loader: {
    marginVertical: 16,
  },
  heroCarouselWrap: {
    position: "relative",
    height: HERO_HEIGHT,
    overflow: "hidden",
    backgroundColor: "#EDEDED",
  },
  heroParallax: {
    width: "100%",
    height: HERO_HEIGHT,
  },
  heroFallbackInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroSlideImage: {
    width: "100%",
    height: HERO_HEIGHT,
    backgroundColor: "#EDEDED",
  },
  photoCounter: {
    position: "absolute",
    right: 14,
    bottom: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(25,25,25,0.72)",
  },
  photoCounterText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    color: "#fff",
  },
  heroFallback: {
    height: HERO_HEIGHT,
    overflow: "hidden",
    backgroundColor: Colors.accent,
  },
  heroInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 72,
    color: "rgba(255,255,255,0.42)",
  },
  sheet: {
    marginTop: -22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#fff",
    padding: 20,
    paddingBottom: 120,
    zIndex: 2,
  },
  statusRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusChipOpen: {
    backgroundColor: "#DCFCE7",
  },
  statusChipClosed: {
    backgroundColor: "#F3F4F6",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
  },
  noiseChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F1F4F8",
  },
  noiseChipText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    color: Colors.primary,
  },
  name: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 27,
    letterSpacing: -0.4,
    lineHeight: 31,
    color: Colors.dark,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },
  metaRating: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 14,
    color: Colors.dark,
  },
  metaReviews: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
  },
  metaDistance: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
  },
  description: {
    marginTop: 12,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 23,
    color: "#3d3d3d",
  },
  amenityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 18,
    gap: 8,
  },
  amenityChipOn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: "#F1F4F8",
  },
  amenityLabelOn: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.dark,
  },
  vibeStrip: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 20,
  },
  vibeCell: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  vibeCellDivider: {
    borderRightWidth: 1,
    borderRightColor: "#EEEEEE",
  },
  vibeCaption: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 10.5,
    color: "#8f8f8f",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  vibeValue: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
    marginTop: 5,
  },
  visitBlock: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  visitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  visitRowSpaced: {
    marginTop: 14,
  },
  visitTileAddress: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F4F7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  visitTileHours: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFF6E8",
    alignItems: "center",
    justifyContent: "center",
  },
  visitValue: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14.5,
    color: Colors.dark,
  },
  closesIn: {
    color: "#888",
  },
  ownerBadge: {
    alignSelf: "flex-start",
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.primary + "14",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
  },
  ownerBadgeText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 12,
    color: Colors.primary,
    letterSpacing: 0.2,
  },
  addedByRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  addedByText: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
  },
  reviewsBlock: {
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    marginTop: 22,
    paddingTop: 18,
  },
  reviewsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  reviewsTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 20,
    color: Colors.dark,
  },
  reviewsTotal: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.primary,
  },
  emptyReviews: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#888",
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  reviewRowLast: {
    borderBottomWidth: 0,
  },
  reviewerAvatarPressablePressed: {
    opacity: 0.85,
  },
  reviewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eee",
  },
  reviewerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewerInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 16,
    color: "#fff",
  },
  reviewContent: {
    flex: 1,
  },
  reviewNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewMenuButton: {
    marginLeft: "auto",
  },
  reviewMenuIcon: {
    marginBottom: 0,
  },
  reviewerName: {
    flexShrink: 1,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  reviewDate: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2,
  },
  reviewBody: {
    marginTop: 8,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: Colors.dark,
  },
  reviewImagesScroll: {
    marginTop: 10,
  },
  reviewThumbPressable: {
    marginRight: 10,
    borderRadius: 10,
    overflow: "hidden",
  },
  reviewThumb: {
    width: 76,
    height: 76,
    borderRadius: 10,
    backgroundColor: "#eee",
  },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderTopWidth: 1,
    borderTopColor: "#EDEDED",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stickyPrimary: {
    flex: 1,
  },
  lightboxRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  lightboxTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  lightboxCounter: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: "rgba(255,255,255,0.9)",
  },
  lightboxCloseHit: {
    padding: 10,
    borderRadius: 22,
  },
  lightboxPager: {
    flex: 1,
  },
  lightboxPage: {
    flex: 1,
    justifyContent: "flex-start",
  },
  lightboxImageStage: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 16,
    minHeight: 160,
  },
  lightboxMainImage: {
    width: "100%",
    flex: 1,
  },
  lightboxFooter: {
    width: "100%",
    flexShrink: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.14)",
  },
  lightboxContributor: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: "#fff",
  },
  lightboxCaptionEyebrow: {
    marginTop: 14,
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.45)",
  },
  lightboxReviewScroll: {
    maxHeight: 140,
    marginTop: 8,
  },
  lightboxReviewText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.88)",
  },
});
