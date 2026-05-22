import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  CalendarDays,
  Clock3,
  Heart,
  MapPin,
  MessageCircle,
  Play,
  Star,
  Users,
} from "lucide-react-native";
import { API_BASE_URL } from "../constants/Api";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { StudySpot } from "../context/SpotsContext";
import {
  feedAuthorDisplayName,
  feedPostGridCover,
  fetchFeedPostById,
  type FeedPost,
} from "../utils/feedApi";
import { getSpotTitle } from "../utils/getSpotTitle";
import type { SharedAttachmentRef } from "../utils/messageShare";
import type { RootStackParamList } from "../types/navigation";
import { fetchSpotById } from "../utils/spotsApi";
import { toNumber } from "../utils/toNumber";
import type { CommunityData } from "../screens/CommunityDetailScreen";
import type { CommunityEvent } from "../screens/EventDetailDrawer";

/** ───────────────────────────────────────────────────────────────────────
 * In-memory cache + de-duped in-flight requests.
 *
 * Chat threads frequently re-render rows (new messages, scroll). Without
 * caching, every render of a shared-attachment bubble would re-hit the
 * network. We key by id and store either the resolved entity or the
 * sentinel `"missing"` so failures don't retry indefinitely.
 * ─────────────────────────────────────────────────────────────────────── */
const postCache = new Map<string, FeedPost | "missing">();
const spotCache = new Map<string, StudySpot | "missing">();
const communityCache = new Map<string, CommunityData | "missing">();
const eventCache = new Map<string, CommunityEvent | "missing">();
const inFlightPost = new Map<string, Promise<FeedPost | null>>();
const inFlightSpot = new Map<string, Promise<StudySpot | null>>();
const inFlightCommunity = new Map<string, Promise<CommunityData | null>>();
const inFlightEvent = new Map<string, Promise<CommunityEvent | null>>();

/** Composite key so event caches don't collide across communities. */
function eventCacheKey(communityId: string, eventId: string): string {
  return `${communityId}/${eventId}`;
}

async function fetchCommunityById(
  token: string,
  id: string,
): Promise<CommunityData | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/communities/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    if (!json || typeof json !== "object") return null;
    const raw =
      (json as Record<string, unknown>).community ??
      (json as Record<string, unknown>);
    if (!raw || typeof raw !== "object") return null;
    return raw as CommunityData;
  } catch {
    return null;
  }
}

async function fetchEventById(
  token: string,
  communityId: string,
  eventId: string,
): Promise<CommunityEvent | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v1/communities/${encodeURIComponent(
        communityId,
      )}/events/${encodeURIComponent(eventId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    if (!json || typeof json !== "object") return null;
    const raw =
      (json as Record<string, unknown>).event ??
      (json as Record<string, unknown>);
    if (!raw || typeof raw !== "object") return null;
    return raw as CommunityEvent;
  } catch {
    return null;
  }
}

function loadPost(token: string, id: string): Promise<FeedPost | null> {
  const cached = postCache.get(id);
  if (cached !== undefined) {
    return Promise.resolve(cached === "missing" ? null : cached);
  }
  const existing = inFlightPost.get(id);
  if (existing) return existing;
  const p = fetchFeedPostById(token, id)
    .then((post) => {
      postCache.set(id, post ?? "missing");
      return post ?? null;
    })
    .catch(() => {
      postCache.set(id, "missing");
      return null;
    })
    .finally(() => {
      inFlightPost.delete(id);
    });
  inFlightPost.set(id, p);
  return p;
}

function loadSpot(id: string): Promise<StudySpot | null> {
  const cached = spotCache.get(id);
  if (cached !== undefined) {
    return Promise.resolve(cached === "missing" ? null : cached);
  }
  const existing = inFlightSpot.get(id);
  if (existing) return existing;
  const p = fetchSpotById(id)
    .then((spot) => {
      spotCache.set(id, spot ?? "missing");
      return spot;
    })
    .catch(() => {
      spotCache.set(id, "missing");
      return null;
    })
    .finally(() => {
      inFlightSpot.delete(id);
    });
  inFlightSpot.set(id, p);
  return p;
}

function loadCommunity(
  token: string,
  id: string,
): Promise<CommunityData | null> {
  const cached = communityCache.get(id);
  if (cached !== undefined) {
    return Promise.resolve(cached === "missing" ? null : cached);
  }
  const existing = inFlightCommunity.get(id);
  if (existing) return existing;
  const p = fetchCommunityById(token, id)
    .then((c) => {
      communityCache.set(id, c ?? "missing");
      return c;
    })
    .catch(() => {
      communityCache.set(id, "missing");
      return null;
    })
    .finally(() => {
      inFlightCommunity.delete(id);
    });
  inFlightCommunity.set(id, p);
  return p;
}

function loadEvent(
  token: string,
  communityId: string,
  eventId: string,
): Promise<CommunityEvent | null> {
  const key = eventCacheKey(communityId, eventId);
  const cached = eventCache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached === "missing" ? null : cached);
  }
  const existing = inFlightEvent.get(key);
  if (existing) return existing;
  const p = fetchEventById(token, communityId, eventId)
    .then((e) => {
      eventCache.set(key, e ?? "missing");
      return e;
    })
    .catch(() => {
      eventCache.set(key, "missing");
      return null;
    })
    .finally(() => {
      inFlightEvent.delete(key);
    });
  inFlightEvent.set(key, p);
  return p;
}

function formatEventDay(iso?: string | null): {
  day: string;
  month: string;
  time: string;
} | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: d.toLocaleDateString(undefined, { day: "2-digit" }),
    month: d
      .toLocaleDateString(undefined, { month: "short" })
      .toUpperCase(),
    time: d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

type Props = {
  refData: SharedAttachmentRef;
  token: string | null;
  /** Sender of the parent message — controls light vs. dark card theme so
   * the preview reads well against either the primary blue (mine) or
   * white (theirs) chat bubble. */
  isMine: boolean;
};

export default function SharedAttachmentPreview({
  refData,
  token,
  isMine,
}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<FeedPost | null>(null);
  const [spot, setSpot] = useState<StudySpot | null>(null);
  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [event, setEvent] = useState<CommunityEvent | null>(null);

  // Capture the second id for events so it can flow into the useEffect dep
  // array without TypeScript narrowing complaints inside the async closure.
  const eventCommunityId =
    refData.kind === "event" ? refData.communityId : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPost(null);
    setSpot(null);
    setCommunity(null);
    setEvent(null);

    (async () => {
      if (refData.kind === "post") {
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const p = await loadPost(token, refData.id);
        if (cancelled) return;
        setPost(p);
        setLoading(false);
        return;
      }
      if (refData.kind === "spot") {
        const s = await loadSpot(refData.id);
        if (cancelled) return;
        setSpot(s);
        setLoading(false);
        return;
      }
      if (refData.kind === "community") {
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const c = await loadCommunity(token, refData.id);
        if (cancelled) return;
        setCommunity(c);
        setLoading(false);
        return;
      }
      // event
      if (!token || !eventCommunityId) {
        if (!cancelled) setLoading(false);
        return;
      }
      const e = await loadEvent(token, eventCommunityId, refData.id);
      if (cancelled) return;
      setEvent(e);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refData.kind, refData.id, eventCommunityId, token]);

  const themeCard = isMine ? styles.cardMine : styles.cardTheirs;
  const themeEyebrow = isMine ? styles.eyebrowMine : styles.eyebrowTheirs;
  const themeTitle = isMine ? styles.titleMine : styles.titleTheirs;
  const themeBody = isMine ? styles.bodyMine : styles.bodyTheirs;
  const themeMeta = isMine ? styles.metaMine : styles.metaTheirs;
  const themeDivider = isMine ? styles.dividerMine : styles.dividerTheirs;

  if (loading) {
    return (
      <View style={[styles.card, themeCard, styles.loadingCard]}>
        <ActivityIndicator
          color={isMine ? "rgba(255,255,255,0.9)" : Colors.dark}
          size="small"
        />
      </View>
    );
  }

  if (refData.kind === "post") {
    if (!post) {
      return <UnavailableCard label="Post unavailable" isMine={isMine} />;
    }
    const cover = feedPostGridCover(post);
    const who = feedAuthorDisplayName(post.author);
    const captionExcerpt =
      post.caption && post.caption.length > 140
        ? `${post.caption.slice(0, 137).trim()}…`
        : post.caption ?? "";

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open post by ${who}`}
        onPress={() => navigation.navigate("FeedPostDetail", { post })}
        style={({ pressed }) => [
          styles.card,
          themeCard,
          pressed && styles.cardPressed,
        ]}
      >
        {cover.uri ? (
          <View style={styles.mediaWrap}>
            <Image
              source={{ uri: cover.uri }}
              style={styles.media}
              resizeMode="cover"
            />
            {cover.isVideo ? (
              <View style={styles.playBadge} pointerEvents="none">
                <Play size={14} color="#fff" fill="#fff" strokeWidth={1.5} />
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.body}>
          <Text style={[styles.eyebrow, themeEyebrow]}>POST</Text>
          <Text style={[styles.title, themeTitle]} numberOfLines={1}>
            {who}
          </Text>
          {captionExcerpt ? (
            <Text style={[styles.bodyText, themeBody]} numberOfLines={3}>
              {captionExcerpt}
            </Text>
          ) : null}
          <View style={[styles.divider, themeDivider]} />
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Heart
                size={12}
                color={isMine ? "rgba(255,255,255,0.78)" : "#888"}
                strokeWidth={2}
              />
              <Text style={[styles.metaText, themeMeta]}>{post.like_count}</Text>
            </View>
            <View style={styles.metaItem}>
              <MessageCircle
                size={12}
                color={isMine ? "rgba(255,255,255,0.78)" : "#888"}
                strokeWidth={2}
              />
              <Text style={[styles.metaText, themeMeta]}>
                {post.comments_count}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  if (refData.kind === "spot") {
    if (!spot) {
      return <UnavailableCard label="Spot unavailable" isMine={isMine} />;
    }
    const title = getSpotTitle(spot);
    const desc =
      typeof spot.description === "string" ? spot.description.trim() : "";
    const descExcerpt =
      desc.length > 140 ? `${desc.slice(0, 137).trim()}…` : desc;
    const rating = toNumber(spot.rating);
    const img =
      typeof spot.image_url === "string" && spot.image_url.trim()
        ? encodeURI(spot.image_url.trim())
        : "";
    const address =
      typeof spot.address === "string" && spot.address.trim()
        ? spot.address.trim()
        : "";

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open study spot ${title}`}
        onPress={() => navigation.navigate("SpotViewer", { spot })}
        style={({ pressed }) => [
          styles.card,
          themeCard,
          pressed && styles.cardPressed,
        ]}
      >
        {img ? (
          <View style={styles.mediaWrap}>
            <Image
              source={{ uri: img }}
              style={styles.media}
              resizeMode="cover"
            />
          </View>
        ) : null}
        <View style={styles.body}>
          <Text style={[styles.eyebrow, themeEyebrow]}>STUDY SPOT</Text>
          <Text style={[styles.title, themeTitle]} numberOfLines={1}>
            {title}
          </Text>
          {descExcerpt ? (
            <Text style={[styles.bodyText, themeBody]} numberOfLines={3}>
              {descExcerpt}
            </Text>
          ) : null}
          <View style={[styles.divider, themeDivider]} />
          <View style={styles.metaRow}>
            {rating !== null ? (
              <View style={styles.metaItem}>
                <Star
                  size={12}
                  color={Colors.accent}
                  fill={Colors.accent}
                  strokeWidth={1.5}
                />
                <Text style={[styles.metaText, themeMeta]}>
                  {rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
            {address ? (
              <View style={[styles.metaItem, { flexShrink: 1 }]}>
                <MapPin
                  size={12}
                  color={isMine ? "rgba(255,255,255,0.78)" : "#888"}
                  strokeWidth={2}
                />
                <Text
                  style={[styles.metaText, themeMeta, { flexShrink: 1 }]}
                  numberOfLines={1}
                >
                  {address}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  if (refData.kind === "community") {
    if (!community) {
      return (
        <UnavailableCard label="Community unavailable" isMine={isMine} />
      );
    }
    const name = community.name?.trim() || "Community";
    const desc =
      typeof community.description === "string"
        ? community.description.trim()
        : "";
    const descExcerpt =
      desc.length > 140 ? `${desc.slice(0, 137).trim()}…` : desc;
    const banner =
      typeof community.banner_url === "string" &&
      community.banner_url.trim()
        ? encodeURI(community.banner_url.trim())
        : typeof community.avatar_url === "string" &&
          community.avatar_url.trim()
          ? encodeURI(community.avatar_url.trim())
          : "";
    const memberCount =
      typeof community.members === "number"
        ? community.members
        : Number(community.members ?? 0);
    const memberLabel = Number.isFinite(memberCount) && memberCount > 0
      ? `${memberCount} member${memberCount === 1 ? "" : "s"}`
      : "";
    const category =
      typeof community.category === "string" && community.category.trim()
        ? community.category.trim()
        : "";

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open community ${name}`}
        onPress={() =>
          navigation.navigate("CommunityDetail", { community })
        }
        style={({ pressed }) => [
          styles.card,
          themeCard,
          pressed && styles.cardPressed,
        ]}
      >
        {banner ? (
          <View style={styles.mediaWrap}>
            <Image
              source={{ uri: banner }}
              style={styles.media}
              resizeMode="cover"
            />
          </View>
        ) : null}
        <View style={styles.body}>
          <Text style={[styles.eyebrow, themeEyebrow]}>COMMUNITY</Text>
          <Text style={[styles.title, themeTitle]} numberOfLines={1}>
            {name}
          </Text>
          {descExcerpt ? (
            <Text style={[styles.bodyText, themeBody]} numberOfLines={3}>
              {descExcerpt}
            </Text>
          ) : null}
          <View style={[styles.divider, themeDivider]} />
          <View style={styles.metaRow}>
            {memberLabel ? (
              <View style={styles.metaItem}>
                <Users
                  size={12}
                  color={isMine ? "rgba(255,255,255,0.78)" : "#888"}
                  strokeWidth={2}
                />
                <Text style={[styles.metaText, themeMeta]}>{memberLabel}</Text>
              </View>
            ) : null}
            {category ? (
              <View style={[styles.metaItem, { flexShrink: 1 }]}>
                <Text
                  style={[styles.metaText, themeMeta, { flexShrink: 1 }]}
                  numberOfLines={1}
                >
                  {category}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  // event
  if (!event) {
    return <UnavailableCard label="Event unavailable" isMine={isMine} />;
  }
  const eventCommunityIdForNav = refData.communityId;
  const evTitle = event.title?.trim() || "Event";
  const evDesc =
    typeof event.description === "string" ? event.description.trim() : "";
  const evDescExcerpt =
    evDesc.length > 120 ? `${evDesc.slice(0, 117).trim()}…` : evDesc;
  const evDay = formatEventDay(event.start_time);
  const evLocation =
    typeof event.location === "string" && event.location.trim()
      ? event.location.trim()
      : event.is_online
        ? "Online"
        : "";
  const evAttendees =
    typeof event.attendee_count === "number" ? event.attendee_count : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open event ${evTitle}`}
      onPress={() =>
        navigation.navigate("CommunityEvents", {
          communityId: eventCommunityIdForNav,
          communityName: "",
          isAdmin: false,
          communityIsPublic: true,
          openEventId: event.id,
        })
      }
      style={({ pressed }) => [
        styles.card,
        themeCard,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.eventRow}>
        {evDay ? (
          <View
            style={[
              styles.eventDateBadge,
              isMine ? styles.eventDateBadgeMine : styles.eventDateBadgeTheirs,
            ]}
          >
            <Text
              style={[
                styles.eventDateMonth,
                isMine
                  ? styles.eventDateMonthMine
                  : styles.eventDateMonthTheirs,
              ]}
            >
              {evDay.month}
            </Text>
            <Text
              style={[
                styles.eventDateDay,
                isMine ? styles.eventDateDayMine : styles.eventDateDayTheirs,
              ]}
            >
              {evDay.day}
            </Text>
          </View>
        ) : (
          <View style={[styles.eventDateBadgeFallback]}>
            <CalendarDays size={20} color={Colors.primary} strokeWidth={2.2} />
          </View>
        )}
        <View style={styles.eventCopyCol}>
          <Text style={[styles.eventEyebrow, themeEyebrow]}>EVENT</Text>
          <Text style={[styles.title, themeTitle]} numberOfLines={2}>
            {evTitle}
          </Text>
          {evDay ? (
            <View style={styles.eventMetaLine}>
              <Clock3
                size={12}
                color={isMine ? "rgba(255,255,255,0.82)" : "#888"}
                strokeWidth={2}
              />
              <Text
                style={[styles.eventMetaText, themeMeta]}
                numberOfLines={1}
              >
                {evDay.time}
              </Text>
            </View>
          ) : null}
          {evLocation ? (
            <View style={styles.eventMetaLine}>
              <MapPin
                size={12}
                color={isMine ? "rgba(255,255,255,0.82)" : "#888"}
                strokeWidth={2}
              />
              <Text
                style={[styles.eventMetaText, themeMeta]}
                numberOfLines={1}
              >
                {evLocation}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {evDescExcerpt ? (
        <View style={styles.eventBodyBlock}>
          <View style={[styles.divider, themeDivider]} />
          <Text style={[styles.bodyText, themeBody]} numberOfLines={2}>
            {evDescExcerpt}
          </Text>
          {evAttendees !== null && evAttendees > 0 ? (
            <View style={[styles.metaRow, styles.eventAttendeesRow]}>
              <View style={styles.metaItem}>
                <Users
                  size={12}
                  color={isMine ? "rgba(255,255,255,0.78)" : "#888"}
                  strokeWidth={2}
                />
                <Text style={[styles.metaText, themeMeta]}>
                  {evAttendees} going
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function UnavailableCard({
  label,
  isMine,
}: {
  label: string;
  isMine: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        isMine ? styles.cardMine : styles.cardTheirs,
        styles.unavailable,
      ]}
    >
      <Text
        style={[
          styles.unavailableText,
          isMine ? { color: "rgba(255,255,255,0.82)" } : { color: "#888" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 260,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 6,
  },
  cardMine: {
    backgroundColor: Colors.primary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
  },
  cardTheirs: {
    backgroundColor: "#FAFAFA",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E5E5",
  },
  cardPressed: {
    opacity: 0.85,
  },
  loadingCard: {
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  unavailable: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  unavailableText: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
  },
  mediaWrap: {
    position: "relative",
    width: "100%",
    height: 140,
    backgroundColor: "#000",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  playBadge: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  eyebrow: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  eyebrowMine: {
    color: "rgba(255,255,255,0.85)",
  },
  eyebrowTheirs: {
    color: Colors.primary,
  },
  title: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
  },
  titleMine: {
    color: "#fff",
  },
  titleTheirs: {
    color: Colors.dark,
  },
  bodyText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  bodyMine: {
    color: "rgba(255,255,255,0.92)",
  },
  bodyTheirs: {
    color: "#444",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 8,
    marginBottom: 8,
  },
  dividerMine: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  dividerTheirs: {
    backgroundColor: "#E5E5E5",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
  },
  metaMine: {
    color: "rgba(255,255,255,0.85)",
  },
  metaTheirs: {
    color: "#666",
  },
  /** Event card layout — a date pill on the left, title + meta lines on
   * the right (similar to the events feed style elsewhere in the app). */
  eventRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  eventDateBadge: {
    width: 50,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eventDateBadgeMine: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.4)",
  },
  eventDateBadgeTheirs: {
    backgroundColor: "#FFF7E6",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FFE3B0",
  },
  eventDateBadgeFallback: {
    width: 50,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F4FA",
  },
  eventDateMonth: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  eventDateMonthMine: {
    color: "rgba(255,255,255,0.9)",
  },
  eventDateMonthTheirs: {
    color: Colors.accent,
  },
  eventDateDay: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    lineHeight: 24,
    marginTop: 2,
  },
  eventDateDayMine: {
    color: "#fff",
  },
  eventDateDayTheirs: {
    color: Colors.dark,
  },
  eventCopyCol: {
    flex: 1,
    minWidth: 0,
  },
  eventEyebrow: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  eventMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  eventMetaText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    flexShrink: 1,
  },
  eventBodyBlock: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  eventAttendeesRow: {
    marginTop: 4,
  },
});
