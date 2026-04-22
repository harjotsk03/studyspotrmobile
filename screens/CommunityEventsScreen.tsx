import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Plus,
  Users,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import type { CommunityStackParamList } from "./CommunityDetailScreen";
import EventDetailDrawer, {
  type CommunityEvent,
  type RsvpStatus,
  formatDate,
} from "./EventDetailDrawer";

// ─── Types ───────────────────────────────────────────────────────────────────

type EventFilter = "upcoming" | "previous";

type Props = NativeStackScreenProps<CommunityStackParamList, "CommunityEvents">;

// ─── Tab Toggle ──────────────────────────────────────────────────────────────

const TABS: { label: string; value: EventFilter }[] = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "previous" },
];

function EventTabToggle({
  value,
  onChange,
}: {
  value: EventFilter;
  onChange: (v: EventFilter) => void;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const thumbWidth = useMemo(
    () => (containerWidth <= 8 ? 0 : (containerWidth - 8) / 2),
    [containerWidth],
  );

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: value === "upcoming" ? 0 : thumbWidth,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    }).start();
  }, [thumbWidth, translateX, value]);

  const handleLayout = (e: LayoutChangeEvent) =>
    setContainerWidth(e.nativeEvent.layout.width);

  return (
    <View style={toggleStyles.container} onLayout={handleLayout}>
      {thumbWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            toggleStyles.pill,
            { width: thumbWidth, transform: [{ translateX }] },
          ]}
        />
      )}
      {TABS.map((tab) => (
        <Pressable
          key={tab.value}
          style={toggleStyles.button}
          onPress={() => onChange(tab.value)}
        >
          <Text
            style={[
              toggleStyles.label,
              value === tab.value && toggleStyles.labelActive,
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  container: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    padding: 4,
    overflow: "hidden",
  },
  pill: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  button: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  label: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 16,
    color: Colors.dark,
  },
  labelActive: {
    color: "#fff",
  },
});

// ─── Event Card ──────────────────────────────────────────────────────────────

function EventCard({
  event,
  onPress,
}: {
  event: CommunityEvent;
  onPress: () => void;
}) {
  const { day, month, time, full } = formatDate(event.start_time);

  return (
    <Pressable
      style={({ pressed }) => [
        cardStyles.container,
        pressed && { opacity: 0.75 },
      ]}
      onPress={onPress}
    >
      <View style={cardStyles.dateBadge}>
        <Text style={cardStyles.dateDay}>{day}</Text>
        <Text style={cardStyles.dateMonth}>{month}</Text>
      </View>

      <View style={cardStyles.body}>
        <Text style={cardStyles.title} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={cardStyles.metaRow}>
          <Clock size={13} color="#888" strokeWidth={2} />
          <Text style={cardStyles.metaText}>
            {full} · {time}
          </Text>
        </View>

        {!!event.location && (
          <View style={cardStyles.metaRow}>
            <MapPin size={13} color="#888" strokeWidth={2} />
            <Text style={cardStyles.metaText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}

        {event.attendee_count !== undefined && (
          <View style={cardStyles.metaRow}>
            <Users size={13} color="#888" strokeWidth={2} />
            <Text style={cardStyles.metaText}>
              {event.attendee_count.toLocaleString()}{" "}
              {event.attendee_count === 1 ? "attendee" : "attendees"}
            </Text>
          </View>
        )}

        {!!event.description && (
          <Text style={cardStyles.description} numberOfLines={2}>
            {event.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 16,
    marginBottom: 12,
    gap: 14,
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
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
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
  description: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
    marginTop: 4,
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CommunityEventsScreen({ route }: Props) {
  const { communityId, communityName, isAdmin } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [filter, setFilter] = useState<EventFilter>("upcoming");
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CommunityEvent | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchEvents = useCallback(
    async (isRefresh = false) => {
      if (!token) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/communities/${communityId}/events?filter=${filter}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        const list: CommunityEvent[] =
          filter === "upcoming" ? (json.upcoming ?? []) : (json.previous ?? []);
        setEvents(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load events.");
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [communityId, filter, token],
  );

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  function openEvent(event: CommunityEvent) {
    setSelectedEvent(event);
    setDrawerOpen(true);
  }

  function handleAttendanceChange(
    eventId: string,
    newCount: number,
    newStatus: RsvpStatus,
  ) {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, attendee_count: newCount, user_rsvp_status: newStatus }
          : e,
      ),
    );
    // Keep selectedEvent in sync so the drawer has fresh data if reopened
    setSelectedEvent((prev) =>
      prev?.id === eventId
        ? { ...prev, attendee_count: newCount, user_rsvp_status: newStatus }
        : prev,
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Events
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {communityName}
          </Text>
        </View>

        {isAdmin ? (
          <TouchableOpacity
            style={[styles.iconButton, styles.createButton]}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate("CreateEvent", { communityId, communityName })
            }
          >
            <Plus size={20} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>

      {/* Tab toggle */}
      <View style={styles.toggleWrapper}>
        <EventTabToggle value={filter} onChange={setFilter} />
      </View>

      {/* Event list */}
      {loading ? (
        <ActivityIndicator
          size="large"
          color={Colors.primary}
          style={styles.loader}
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

          {!error && events.length === 0 && (
            <View style={styles.emptyContainer}>
              <CalendarDays size={44} color="#ccc" strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>
                {filter === "upcoming"
                  ? "No upcoming events"
                  : "No past events"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {filter === "upcoming"
                  ? isAdmin
                    ? "Tap + to schedule the first event for this community."
                    : "Nothing scheduled yet — check back soon."
                  : "This community hasn't held any events yet."}
              </Text>
            </View>
          )}

          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onPress={() => openEvent(event)}
            />
          ))}
        </ScrollView>
      )}

      {/* Event detail drawer */}
      <EventDetailDrawer
        event={selectedEvent}
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        communityId={communityId}
        token={token}
        onAttendanceChange={handleAttendanceChange}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  createButton: {
    backgroundColor: Colors.accent,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 12,
  },
  headerTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  headerSubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 1,
  },
  toggleWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  loader: {
    marginTop: 48,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 4,
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
