import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Search,
  Users,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Input from "../components/Input";
import { SkeletonBox, SkeletonCard, SkeletonList } from "../components/Skeleton";
import type { CommunityStackParamList } from "./CommunityDetailScreen";
import EventDetailDrawer, {
  type CommunityEvent,
  type RsvpStatus,
  formatDate,
} from "./EventDetailDrawer";

type EventFilter = "all" | "upcoming" | "previous";

type ApiCommunity = {
  id: string;
  name: string;
  is_public?: boolean;
  user_role?: string;
};

type ApiBrowseEvent = CommunityEvent & {
  community_id?: string;
  communityId?: string;
  community_name?: string;
  communityName?: string;
  community?: ApiCommunity;
  communities?: ApiCommunity;
  community_is_public?: boolean;
  communityIsPublic?: boolean;
  user_community_role?: string;
  userCommunityRole?: string;
};

type BrowseEvent = CommunityEvent & {
  communityId: string;
  communityName: string;
  communityIsPublic: boolean;
  userCommunityRole?: string;
};

const FILTERS: { label: string; value: EventFilter }[] = [
  { label: "All", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "previous" },
];

function eventsFromResponse(json: Record<string, unknown>, filter: EventFilter) {
  if (Array.isArray(json.events)) return json.events as ApiBrowseEvent[];
  if (filter === "upcoming" && Array.isArray(json.upcoming)) {
    return json.upcoming as ApiBrowseEvent[];
  }
  if (filter === "previous" && Array.isArray(json.previous)) {
    return json.previous as ApiBrowseEvent[];
  }
  if (filter === "all") {
    const upcoming = Array.isArray(json.upcoming)
      ? (json.upcoming as ApiBrowseEvent[])
      : [];
    const previous = Array.isArray(json.previous)
      ? (json.previous as ApiBrowseEvent[])
      : [];
    return [...upcoming, ...previous];
  }
  return [];
}

function toBrowseEvent(event: ApiBrowseEvent): BrowseEvent {
  const community = event.community ?? event.communities;
  return {
    ...event,
    communityId: event.communityId ?? event.community_id ?? community?.id ?? "",
    communityName:
      event.communityName ??
      event.community_name ??
      community?.name ??
      "Community event",
    communityIsPublic:
      event.communityIsPublic ??
      event.community_is_public ??
      community?.is_public ??
      true,
    userCommunityRole:
      event.userCommunityRole ??
      event.user_community_role ??
      community?.user_role,
  };
}

function BrowseEventCard({
  event,
  onPress,
}: {
  event: BrowseEvent;
  onPress: () => void;
}) {
  const { day, month, time, full } = formatDate(event.start_time);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.eventCard,
        pressed && styles.eventCardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.dateBadge}>
        <Text style={styles.dateDay}>{day}</Text>
        <Text style={styles.dateMonth}>{month}</Text>
      </View>

      <View style={styles.eventBody}>
        <Text style={styles.eventCommunity} numberOfLines={1}>
          {event.communityName}
        </Text>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.metaRow}>
          <Clock size={13} color="#888" strokeWidth={2} />
          <Text style={styles.metaText}>
            {full} · {time}
          </Text>
        </View>
        {!!event.location && (
          <View style={styles.metaRow}>
            <MapPin size={13} color="#888" strokeWidth={2} />
            <Text style={styles.metaText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}
        {event.attendee_count !== undefined && (
          <View style={styles.metaRow}>
            <Users size={13} color="#888" strokeWidth={2} />
            <Text style={styles.metaText}>
              {event.attendee_count.toLocaleString()}{" "}
              {event.attendee_count === 1 ? "attendee" : "attendees"}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function BrowseEventsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [filter, setFilter] = useState<EventFilter>("all");
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<BrowseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<BrowseEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchEvents = useCallback(
    async (isRefresh = false) => {
      if (!token) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/events?filter=${filter}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }

        setEvents(
          eventsFromResponse(json, filter)
            .map(toBrowseEvent)
            .sort(
              (a, b) =>
                new Date(a.start_time).getTime() -
                new Date(b.start_time).getTime(),
            ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load events.");
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [filter, token],
  );

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return events;

    return events.filter((event) =>
      [
        event.title,
        event.description,
        event.location,
        event.communityName,
        event.event_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [events, query]);

  function openEvent(event: BrowseEvent) {
    setSelectedEvent(event);
    setDrawerOpen(true);
  }

  function handleAttendanceChange(
    eventId: string,
    newCount: number,
    newStatus: RsvpStatus,
  ) {
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? {
              ...event,
              attendee_count: newCount,
              user_rsvp_status: newStatus,
            }
          : event,
      ),
    );
    setSelectedEvent((current) =>
      current?.id === eventId
        ? {
            ...current,
            attendee_count: newCount,
            user_rsvp_status: newStatus,
          }
        : current,
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Browse Events</Text>
        <View style={styles.iconButtonPlaceholder} />
      </View>

      <View style={styles.controls}>
        <View style={styles.filterRow}>
          {FILTERS.map((item) => {
            const selected = filter === item.value;
            return (
              <Pressable
                key={item.value}
                style={[
                  styles.filterButton,
                  selected && styles.filterButtonActive,
                ]}
                onPress={() => setFilter(item.value)}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    selected && styles.filterLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Input
          placeholder="Search events"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          icon={<Search size={16} color="#999" strokeWidth={2.2} />}
          containerStyle={styles.searchInput}
        />
      </View>

      {loading ? (
        <SkeletonList
          count={4}
          style={styles.list}
          row={
            <SkeletonCard style={styles.eventSkeletonCard}>
              <SkeletonBox width="58%" height={18} radius={9} />
              <SkeletonBox width="82%" height={14} radius={7} />
              <View style={styles.eventSkeletonMeta}>
                <SkeletonBox width={92} height={13} radius={7} />
                <SkeletonBox width={74} height={13} radius={7} />
              </View>
            </SkeletonCard>
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchEvents(true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        >
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {!error && filteredEvents.length === 0 && (
            <View style={styles.emptyContainer}>
              <CalendarDays size={44} color="#ccc" strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No events found</Text>
              <Text style={styles.emptySubtitle}>
                Try another filter or search term.
              </Text>
            </View>
          )}

          {filteredEvents.map((event) => (
            <BrowseEventCard
              key={`${event.communityId}-${event.id}`}
              event={event}
              onPress={() => openEvent(event)}
            />
          ))}
        </ScrollView>
      )}

      <EventDetailDrawer
        event={selectedEvent}
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        communityId={selectedEvent?.communityId ?? ""}
        token={token}
        communityIsPublic={selectedEvent?.communityIsPublic ?? true}
        userCommunityRole={selectedEvent?.userCommunityRole}
        onAttendanceChange={handleAttendanceChange}
      />
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
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginHorizontal: 12,
  },
  controls: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  filterRow: {
    flexDirection: "row",
    backgroundColor: "#f9f9f9",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    padding: 4,
    gap: 4,
  },
  filterButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
  },
  filterLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: Colors.dark,
  },
  filterLabelActive: {
    color: "#fff",
  },
  searchInput: {
    marginTop: 0,
  },
  loader: {
    marginTop: 48,
  },
  eventSkeletonCard: {
    gap: 12,
    padding: 16,
  },
  eventSkeletonMeta: {
    flexDirection: "row",
    gap: 10,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  eventCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  eventCardPressed: {
    opacity: 0.75,
  },
  dateBadge: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.primary + "14",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dateDay: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.primary,
    lineHeight: 22,
  },
  dateMonth: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  eventBody: {
    flex: 1,
    gap: 4,
  },
  eventCommunity: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 12,
    color: Colors.accent,
  },
  eventTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    flex: 1,
  },
  errorText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
    marginTop: 24,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
  },
});
