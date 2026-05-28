import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
import {
  ArrowLeft,
  Clock3,
  Coffee,
  Edit3,
  EllipsisVertical,
  LayoutGrid,
  MapPin,
  MessageSquarePlus,
  Plug,
  Presentation,
  Send,
  Star,
  SunMedium,
  Trash2,
  UserRound,
  UsersRound,
  X,
  Volume2,
  Wifi,
} from "lucide-react-native";
import ShareToFriendsSheet from "../components/ShareToFriendsSheet";
import SpotReviewComposerModal, {
  type ComposerMode,
} from "../components/SpotReviewComposerModal";
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
import { getSpotDescription } from "../utils/getSpotDescription";
import { getSpotTitle } from "../utils/getSpotTitle";
import { toNumber } from "../utils/toNumber";
import type { RootStackParamList, SpotsStackParamList } from "../types/navigation";
import Button from "../components/Button";
import { Share2 } from "lucide-react-native/icons";

type Props =
  | NativeStackScreenProps<SpotsStackParamList, "SpotDetail">
  | NativeStackScreenProps<RootStackParamList, "SpotViewer">;

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
  { label: "Food & drinks", Icon: Coffee, read: (s) => s.food_drink_allowed },
  { label: "Wi‑Fi", Icon: Wifi, read: (s) => s.wifi_available },
  { label: "Power outlets", Icon: Plug, read: (s) => s.outlets_available },
  {
    label: "Whiteboards",
    Icon: Presentation,
    read: (s) => s.whiteboards_available,
  },
  {
    label: "Group friendly",
    Icon: UsersRound,
    read: (s) => s.group_work_friendly,
  },
];

function SoftDivider() {
  return <View style={styles.softDivider} />;
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
          size={14}
          color={i <= n ? Colors.accent : "#ddd"}
          fill={i <= n ? Colors.accent : "transparent"}
          strokeWidth={2}
        />
      ))}
    </View>
  );
}

function VibeTile({
  Icon,
  subtitle,
  value,
}: {
  Icon: ComponentType<SvgIconProps>;
  subtitle: string;
  value: string;
}) {
  return (
    <View style={styles.vibeTile}>
      <View style={styles.vibeIconBubble}>
        <Icon size={20} color={Colors.primary} strokeWidth={2.2} />
      </View>
      <Text style={styles.vibeTileSubtitle}>{subtitle}</Text>
      <Text style={styles.vibeTileValue} numberOfLines={2}>
        {value}
      </Text>
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
  const lightboxListRef = useRef<FlatList<SpotGalleryItem>>(null);

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
  const ratingLabel = formatRating(spot.rating);
  const reviewCountLabel = formatCount(spot.rating_count);
  const noiseLabel = getNoiseLabel(spot);
  const lightingLabel =
    typeof spot.lighting === "string" ? spot.lighting.trim() : "";
  const tablesLabel = typeof spot.tables === "string" ? spot.tables.trim() : "";
  const hasVibeTiles = Boolean(noiseLabel || lightingLabel || tablesLabel);
  const hasVisitBlock = Boolean(
    (typeof spot.address === "string" && spot.address.trim()) ||
    spot.open_time ||
    spot.close_time,
  );

  const isSpotOwner = Boolean(
    user?.id && spot.created_by_id && user.id === spot.created_by_id,
  );

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

  const confirmDeleteReview = (r: SpotReview) => {
    const rid = spotReviewPrimaryId(r);
    if (!rid || !user?.id) return;
    Alert.alert(
      "Delete review",
      "This removes your review and updates the spot rating.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteReviewJson({
                  review_id: rid,
                  spot_id: spotId,
                  user_id: user.id,
                  deleting_user_points: true,
                });
                await loadData();
                await refetchSpots();
              } catch (e) {
                Alert.alert(
                  "Error",
                  e instanceof Error ? e.message : "Could not delete review.",
                );
              }
            })();
          },
        },
      ],
    );
  };

  const spotMenu = () => {
    if (!isSpotOwner || !user?.id) return;
    Alert.alert(title, undefined, [
      {
        text: "Edit spot",
        onPress: () => {
          if (route.name === "SpotViewer") {
            rootNavigation.navigate("MainTabs", {
              screen: "Spots",
              params: { screen: "EditSpot", params: { spot } },
            });
            navigation.goBack();
            return;
          }
          (
            navigation as NativeStackNavigationProp<SpotsStackParamList>
          ).navigate("EditSpot", { spot });
        },
      },
      {
        text: "Delete spot",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "Delete this spot?",
            "Reviews and photos will be removed. This cannot be undone.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  void (async () => {
                    try {
                      await deleteSpotJson({
                        spot_id: spotId,
                        user_id: user.id,
                        deleting_user_points: true,
                      });
                      await refetchSpots();
                      navigation.goBack();
                    } catch (e) {
                      Alert.alert(
                        "Error",
                        e instanceof Error
                          ? e.message
                          : "Could not delete spot.",
                      );
                    }
                  })();
                },
              },
            ],
          );
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Button
          size="icon"
          icon={<ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />}
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerActions}>
          {isSpotOwner ? (
            <Button
              size="icon"
              icon={<EllipsisVertical size={20} color={Colors.dark} />}
              variant="ghost"
              onPress={spotMenu}
            />
          ) : null}
          {!token && !isSpotOwner ? <View style={styles.placeholder} /> : null}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
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
                  style={{ width: windowWidth, height: 220 }}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.heroSlideImage}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
            />
            {galleryItems.length > 1 ? (
              <View style={styles.heroDots} pointerEvents="none">
                {galleryItems.map((_, i) => (
                  <View
                    key={`hero-dot-${i}`}
                    style={[
                      styles.heroDot,
                      i === heroSlideIndex && styles.heroDotActive,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.heroFallback}>
            <Text style={styles.heroInitial}>
              {title.charAt(0).toUpperCase()}
            </Text>
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

          {isSpotOwner ? (
            <View style={styles.ownerBadge}>
              <Text style={styles.ownerBadgeText}>Your listing</Text>
            </View>
          ) : null}

          {spot.created_by_name ? (
            <View style={styles.inlineInfoRow}>
              <UserRound size={16} color="#777" />
              <Text style={styles.inlineInfoText}>
                Added by {spot.created_by_name}
              </Text>
            </View>
          ) : null}

          <View style={styles.reviewCtaContainer}>
            <View style={styles.reviewCtaButton}>
              <Button
                icon={<MessageSquarePlus size={16} color="#fff" />}
                label="Write a review"
                variant="default"
                size="default"
                onPress={openComposerCreate}
              />
            </View>
            <View>
              <Button
                size="default"
                icon={<Share2 size={16} color={Colors.dark} />}
                variant="outline"
                onPress={() => setShareSheetOpen(true)}
              />
            </View>
          </View>
        </View>

        <View style={[styles.detailsCard, styles.detailsCardElevated]}>
          <Text style={styles.detailsCardTitle}>At a glance</Text>
          {hasVibeTiles ? (
            <>
              <Text style={styles.detailsEyebrow}>Study vibe</Text>
              <View style={styles.vibeTileRow}>
                {noiseLabel ? (
                  <VibeTile
                    Icon={Volume2}
                    subtitle="Noise"
                    value={noiseLabel}
                  />
                ) : null}
                {lightingLabel ? (
                  <VibeTile
                    Icon={SunMedium}
                    subtitle="Lighting"
                    value={lightingLabel}
                  />
                ) : null}
                {tablesLabel ? (
                  <VibeTile
                    Icon={LayoutGrid}
                    subtitle="Seating"
                    value={tablesLabel}
                  />
                ) : null}
              </View>
            </>
          ) : null}

          {hasVibeTiles && hasVisitBlock ? <SoftDivider /> : null}

          {hasVisitBlock ? (
            <>
              <Text style={styles.detailsEyebrow}>Visit</Text>
              {typeof spot.address === "string" && spot.address.trim() ? (
                <View style={styles.visitRow}>
                  <View style={styles.visitIconWrap}>
                    <MapPin
                      size={18}
                      color={Colors.primary}
                      strokeWidth={2.2}
                    />
                  </View>
                  <View style={styles.visitTextWrap}>
                    <Text style={styles.visitLabel}>Address</Text>
                    <Text style={styles.visitBody}>{spot.address.trim()}</Text>
                  </View>
                </View>
              ) : null}
              {spot.open_time || spot.close_time ? (
                <View style={[styles.visitRow, styles.visitRowHours]}>
                  <View style={styles.visitIconWrap}>
                    <Clock3 size={18} color={Colors.accent} strokeWidth={2.2} />
                  </View>
                  <View style={styles.visitTextWrap}>
                    <Text style={styles.visitLabel}>Typical hours</Text>
                    <Text style={styles.visitBody}>
                      {[spot.open_time, spot.close_time]
                        .filter(Boolean)
                        .join(" – ")}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {hasVibeTiles || hasVisitBlock ? <SoftDivider /> : null}

          <Text style={styles.detailsEyebrow}>Amenities</Text>
          <View style={styles.amenityGrid}>
            {AMENITIES.map(({ Icon, label, read }) => {
              const on = amenityOn(read(spot));
              return (
                <View
                  key={label}
                  style={[styles.amenityTile, !on && styles.amenityTileOff]}
                >
                  <View
                    style={[
                      styles.amenityIconWrap,
                      !on && styles.amenityIconWrapMuted,
                    ]}
                  >
                    <Icon
                      size={22}
                      color={on ? Colors.primary : "#B8B8B8"}
                      strokeWidth={2}
                    />
                  </View>
                  <Text
                    style={[
                      styles.amenityLabel,
                      !on && styles.amenityLabelMuted,
                    ]}
                    numberOfLines={2}
                  >
                    {label}
                  </Text>
                  <View
                    style={[
                      styles.amenityBadge,
                      on ? styles.amenityBadgeOn : styles.amenityBadgeOff,
                    ]}
                  >
                    <Text
                      style={[
                        styles.amenityBadgeLabel,
                        !on && styles.amenityBadgeLabelOff,
                      ]}
                    >
                      {on ? "Yes" : "No"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.section, styles.lastSection]}>
          <Text style={styles.sectionTitle}>Reviews</Text>
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
                typeof r.rating === "number" ? r.rating : Number(r.rating) || 0;
              const dateLbl = formatReviewDate(r.created_at);

              return (
                <View
                  key={spotReviewPrimaryId(r) ?? `rev-${idx}`}
                  style={[
                    styles.reviewCard,
                    idx === reviews.length - 1 && styles.reviewCardLast,
                  ]}
                >
                  <View style={styles.reviewTop}>
                    <View style={styles.reviewAuthor}>
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
                          <View style={styles.reviewerAvatarFallback}>
                            <Text style={styles.reviewerInitial}>
                              {rn.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                      <View style={styles.reviewerTextCol}>
                        <Text style={styles.reviewerName}>{rn}</Text>
                        {dateLbl ? (
                          <Text style={styles.reviewDate}>{dateLbl}</Text>
                        ) : null}
                      </View>
                    </View>
                    <ReviewStars value={ratingNum} />
                  </View>

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

                  {mine ? (
                    <View style={styles.reviewActions}>
                      <Button
                        size="sm"
                        label="Edit"
                        icon={<Edit3 size={16} color={Colors.dark} />}
                        variant="secondary"
                        onPress={() => openComposerEdit(r)}
                      />
                      <Button
                        size="sm"
                        label="Delete"
                        icon={<Trash2 size={16} color="#ffffff" />}
                        variant="destructive"
                        onPress={() => confirmDeleteReview(r)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

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

      <ShareToFriendsSheet
        visible={shareSheetOpen}
        attachment={shareSheetOpen ? { kind: "spot", spot } : null}
        token={token}
        navigation={rootNavigation as unknown as NavigationProp<ParamListBase>}
        onClose={() => setShareSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  reviewCtaContainer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  reviewCtaButton: {
    flex: 1,
  },
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  loader: {
    marginVertical: 16,
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
  lightboxRole: {
    marginTop: 4,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
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
  heroCarouselWrap: {
    position: "relative",
    height: 220,
    backgroundColor: "#EDEDED",
  },
  heroSlideImage: {
    width: "100%",
    height: 220,
    backgroundColor: "#EDEDED",
  },
  heroDots: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  heroDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
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
  ownerBadge: {
    alignSelf: "flex-start",
    marginTop: 14,
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
  primaryReviewCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryReviewCtaLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: "#fff",
  },
  section: {
    marginTop: 12,
    marginHorizontal: 16,
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  lastSection: {
    marginBottom: 48,
  },
  sectionTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 20,
    color: Colors.dark,
    marginBottom: 14,
  },
  detailsCard: {
    marginTop: 10,
    marginHorizontal: 16,
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  detailsCardElevated: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  detailsCardTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  detailsEyebrow: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 11,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.85,
    marginBottom: 10,
    marginTop: 2,
  },
  softDivider: {
    height: 1,
    backgroundColor: "#EFEFEF",
    marginVertical: 18,
  },
  vibeTileRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  vibeTile: {
    width: "31%",
    minWidth: 96,
    flexGrow: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    padding: 12,
  },
  vibeIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2EAF3",
  },
  vibeTileSubtitle: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  vibeTileValue: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.dark,
    lineHeight: 19,
  },
  visitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  visitRowHours: {
    marginTop: 14,
  },
  visitIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F4F7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  visitTextWrap: {
    flex: 1,
  },
  visitLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  visitBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  amenityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  amenityTile: {
    width: "47.5%",
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECECEC",
    padding: 12,
    paddingBottom: 10,
  },
  amenityTileOff: {
    opacity: 0.72,
    backgroundColor: "#F5F5F5",
    borderColor: "#E8E8E8",
  },
  amenityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#EDEDED",
  },
  amenityIconWrapMuted: {
    borderColor: "#EAEAEA",
    backgroundColor: "#FDFDFD",
  },
  amenityLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.dark,
    marginBottom: 10,
    minHeight: 36,
  },
  amenityLabelMuted: {
    color: "#8A8A8A",
  },
  amenityBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  amenityBadgeOn: {
    backgroundColor: "#DCFCE7",
  },
  amenityBadgeOff: {
    backgroundColor: "#F3F4F6",
  },
  amenityBadgeLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    color: "#166534",
  },
  amenityBadgeLabelOff: {
    color: "#6B7280",
  },
  emptyReviews: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#888",
  },
  reviewCard: {
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
    paddingVertical: 16,
  },
  reviewCardLast: {
    borderBottomWidth: 0,
  },
  reviewTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  reviewAuthor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  reviewerAvatarPressablePressed: {
    opacity: 0.85,
  },
  reviewerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#eee",
  },
  reviewerAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent + "28",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewerInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 17,
    color: Colors.dark,
  },
  reviewerTextCol: {
    flexShrink: 1,
  },
  reviewerName: {
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
    paddingTop: 4,
  },
  reviewBody: {
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  reviewImagesScroll: {
    marginTop: 10,
    marginHorizontal: -4,
  },
  reviewThumbPressable: {
    marginRight: 10,
    borderRadius: 12,
    overflow: "hidden",
  },
  reviewThumb: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: "#eee",
  },
  reviewActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  miniBtnOutline: {
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
  },
  miniBtnDangerOutline: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  miniBtnLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: Colors.dark,
  },
  miniBtnLabelDanger: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: "#B91C1C",
  },
});
