import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import CommunityCard from "../components/CommunityCard";
import Input from "../components/Input";
import TopNav from "../components/TopNav";
import {
  SkeletonBox,
  SkeletonCard,
  SkeletonList,
} from "../components/Skeleton";
import type {
  CommunityData,
  CommunityStackParamList,
  CommunityLatestMember,
} from "./CommunityDetailScreen";
import EventDetailDrawer, {
  type CommunityEvent as DrawerEvent,
  type RsvpStatus,
} from "./EventDetailDrawer";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  MapPin,
  Search,
  Users,
} from "lucide-react-native";

// Cycle through these when the API doesn't return a colour
const FALLBACK_COLORS = [
  "#FF9900",
  "#1A61A8",
  "#E84393",
  "#6C5CE7",
  "#A0522D",
  "#00B894",
  "#191919",
  "#FDCB6E",
];

interface ApiMember {
  id?: string;
  profile_photo?: string;
  avatar_url?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface ApiCommunity {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  latest_members?: (ApiMember | string)[];
  avatar_url?: string;
  banner_url?: string;
  color?: string;
  category?: string;
  is_public?: boolean;
  user_role?: string;
}

type ApiBrowseEvent = DrawerEvent & {
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

type BrowseEvent = DrawerEvent & {
  communityId: string;
  communityName: string;
  communityIsPublic: boolean;
  userCommunityRole?: string;
};

function toBrowseEvent(event: ApiBrowseEvent): BrowseEvent {
  const community = event.community ?? event.communities;
  return {
    ...event,
    communityId: event.communityId ?? event.community_id ?? community?.id ?? "",
    communityName:
      event.communityName ??
      event.community_name ??
      community?.name ??
      "General",
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

function formatEventDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { day: "--", month: "---", full: "Unknown date", time: "--:--" };
  }
  return {
    day: d.toLocaleDateString(undefined, { day: "2-digit" }),
    month: d.toLocaleDateString(undefined, { month: "short" }),
    full: d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function toMemberAvatars(latest_members?: (ApiMember | string)[]): string[] {
  if (!latest_members) return [];
  return latest_members
    .map((m) =>
      typeof m === "string" ? m : (m.profile_photo ?? m.avatar_url ?? ""),
    )
    .filter(Boolean) as string[];
}

function toLatestMembers(
  latest_members?: (ApiMember | string)[],
): CommunityLatestMember[] {
  if (!latest_members) return [];

  return latest_members.map((member) =>
    typeof member === "string" ? { profile_photo: member } : member,
  );
}

function toCommunityData(api: ApiCommunity, index: number): CommunityData {
  return {
    id: api.id,
    name: api.name,
    description: api.description ?? "",
    members: api.member_count,
    icon: api.avatar_url,
    banner_url: api.banner_url,
    color: api.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    category: api.category,
    is_public: api.is_public,
    user_role: api.user_role,
    latestMembers: toLatestMembers(api.latest_members),
    memberAvatars: toMemberAvatars(api.latest_members),
  };
}

function CommunityEventCard({
  event,
  onPress,
}: {
  event: BrowseEvent;
  onPress: () => void;
}) {
  const { day, month, full, time } = formatEventDate(event.start_time);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.eventCard,
        pressed && styles.eventCardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.eventDateBadge}>
        <Text style={styles.eventDateDay}>{day}</Text>
        <Text style={styles.eventDateMonth}>{month}</Text>
      </View>
      <View style={styles.eventBody}>
        <Text style={styles.eventCommunityName} numberOfLines={1}>
          {event.communityName || "General"}
        </Text>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.eventMetaRow}>
          <Clock size={13} color="#888" strokeWidth={2} />
          <Text style={styles.eventMetaText} numberOfLines={1}>
            {full} · {time}
          </Text>
        </View>
        {!!event.location && (
          <View style={styles.eventMetaRow}>
            <MapPin size={13} color="#888" strokeWidth={2} />
            <Text style={styles.eventMetaText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        )}
        {typeof event.attendee_count === "number" ? (
          <View style={styles.eventMetaRow}>
            <Users size={13} color="#888" strokeWidth={2} />
            <Text style={styles.eventMetaText}>
              {event.attendee_count.toLocaleString()} attendees
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function CommunityScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const { token } = useAuth();

  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "public" | "private"
  >("all");
  const [activeTab, setActiveTab] = useState<"communities" | "events">(
    "communities",
  );

  const [events, setEvents] = useState<BrowseEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsRefreshing, setEventsRefreshing] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [eventQuery, setEventQuery] = useState("");

  const [selectedEvent, setSelectedEvent] = useState<BrowseEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openEvent = (event: BrowseEvent) => {
    setSelectedEvent(event);
    setDrawerOpen(true);
  };

  const handleAttendanceChange = (
    eventId: string,
    newCount: number,
    newStatus: RsvpStatus,
  ) => {
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
      current && current.id === eventId
        ? {
            ...current,
            attendee_count: newCount,
            user_rsvp_status: newStatus,
          }
        : current,
    );
  };

  const fetchCommunities = async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/?limit=20&offset=0`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const mapped: CommunityData[] = (json.communities as ApiCommunity[]).map(
        (c, i) => toCommunityData(c, i),
      );
      setCommunities(mapped);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load communities.",
      );
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  };

  const fetchEvents = async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setEventsRefreshing(true);
    else setEventsLoading(true);
    setEventsError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/events?filter=all`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok || !json || typeof json !== "object") {
        throw new Error(
          (json as { error?: string })?.error ??
            `Failed to load events (${res.status})`,
        );
      }
      const obj = json as Record<string, unknown>;
      const upcoming = Array.isArray(obj.upcoming) ? obj.upcoming : [];
      const previous = Array.isArray(obj.previous) ? obj.previous : [];
      const all = Array.isArray(obj.events)
        ? obj.events
        : [...upcoming, ...previous];
      const normalized = all
        .filter((item): item is ApiBrowseEvent =>
          Boolean(item && typeof item === "object"),
        )
        .map(toBrowseEvent)
        .sort(
          (a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        );
      setEvents(normalized);
    } catch (err) {
      setEventsError(
        err instanceof Error ? err.message : "Failed to load events.",
      );
      setEvents([]);
    } finally {
      if (isRefresh) setEventsRefreshing(false);
      else setEventsLoading(false);
    }
  };

  useEffect(() => {
    void fetchCommunities();
    void fetchEvents();
  }, [token]);

  const onRefresh = () => {
    if (activeTab === "communities") {
      void fetchCommunities(true);
    } else {
      void fetchEvents(true);
    }
  };

  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(
        communities
          .map((community) => community.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return ["All", ...unique];
  }, [communities]);

  const filteredCommunities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return communities.filter((community) => {
      const matchesQuery =
        !normalizedQuery ||
        [community.name, community.description, community.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesCategory =
        categoryFilter === "All" || community.category === categoryFilter;

      const matchesVisibility =
        visibilityFilter === "all" ||
        (visibilityFilter === "public" && community.is_public !== false) ||
        (visibilityFilter === "private" && community.is_public === false);

      return matchesQuery && matchesCategory && matchesVisibility;
    });
  }, [categoryFilter, communities, query, visibilityFilter]);

  const filteredEvents = useMemo(() => {
    const q = eventQuery.trim().toLowerCase();
    if (!q) return events;
    return events.filter((event) =>
      [
        event.title,
        event.description,
        event.communityName,
        event.location,
        event.event_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [eventQuery, events]);

  return (
    <View style={styles.container}>
      <TopNav />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={
              activeTab === "communities" ? refreshing : eventsRefreshing
            }
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={styles.tabSwitchWrap}>
          <Pressable
            style={[
              styles.tabSwitchBtn,
              activeTab === "communities" && styles.tabSwitchBtnActive,
            ]}
            onPress={() => setActiveTab("communities")}
          >
            <Text
              style={[
                styles.tabSwitchTx,
                activeTab === "communities" && styles.tabSwitchTxActive,
              ]}
            >
              Communities
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tabSwitchBtn,
              activeTab === "events" && styles.tabSwitchBtnActive,
            ]}
            onPress={() => setActiveTab("events")}
          >
            <Text
              style={[
                styles.tabSwitchTx,
                activeTab === "events" && styles.tabSwitchTxActive,
              ]}
            >
              Events
            </Text>
          </Pressable>
        </View>

        {activeTab === "communities" ? (
          <View style={styles.communitiesContainer}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>
                Popular Communities Near You
              </Text>
              <Button
                label="Create"
                variant="accent"
                size="sm"
                onPress={() => navigation.navigate("CreateCommunity")}
              />
            </View>
            <Input
              placeholder="Search communities"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              icon={<Search size={16} color="#999" strokeWidth={2.2} />}
              containerStyle={styles.searchInput}
            />

            <Pressable
              style={styles.categorySelector}
              onPress={() => setCategoryModalVisible(true)}
            >
              <View>
                <Text style={styles.categorySelectorLabel}>Category</Text>
                <Text style={styles.categorySelectorValue}>
                  {categoryFilter}
                </Text>
              </View>
              <ChevronDown size={18} color="#777" strokeWidth={2.2} />
            </Pressable>

            <View style={styles.visibilityRow}>
              {[
                { label: "All", value: "all" as const },
                { label: "Public", value: "public" as const },
                { label: "Private", value: "private" as const },
              ].map((item) => {
                const selected = visibilityFilter === item.value;
                return (
                  <Pressable
                    key={item.value}
                    style={[
                      styles.visibilityChip,
                      selected && styles.visibilityChipActive,
                    ]}
                    onPress={() => setVisibilityFilter(item.value)}
                  >
                    <Text
                      style={[
                        styles.visibilityChipText,
                        selected && styles.visibilityChipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {loading && (
              <SkeletonList
                count={4}
                row={
                  <SkeletonCard style={styles.communitySkeletonCard}>
                    <View style={styles.communitySkeletonTop}>
                      <SkeletonBox width={48} height={48} radius={24} />
                      <View style={{ flex: 1, gap: 8 }}>
                        <SkeletonBox width="65%" height={18} radius={9} />
                        <SkeletonBox width="38%" height={13} radius={7} />
                      </View>
                    </View>
                    <SkeletonBox width="100%" height={14} radius={7} />
                    <SkeletonBox width="84%" height={14} radius={7} />
                  </SkeletonCard>
                }
              />
            )}

            {!loading && !!error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            {!loading && !error && communities.length === 0 && (
              <Text style={styles.emptyText}>No communities found.</Text>
            )}

            {!loading &&
              !error &&
              communities.length > 0 &&
              filteredCommunities.length === 0 && (
                <Text style={styles.emptyText}>
                  No communities match your filters.
                </Text>
              )}

            {filteredCommunities.map((community) => (
              <CommunityCard
                key={community.id}
                name={community.name}
                members={community.members}
                latestMembers={community.latestMembers}
                description={community.description}
                icon={community.icon}
                color={community.color}
                memberAvatars={community.memberAvatars}
                onPress={() =>
                  navigation.navigate("CommunityDetail", { community })
                }
              />
            ))}
          </View>
        ) : (
          <View style={styles.communitiesContainer}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Discover Events</Text>
              <Button
                label="New Event"
                variant="accent"
                size="sm"
                onPress={() => navigation.navigate("CreateEvent", {})}
              />
            </View>
            <Input
              placeholder="Search events"
              value={eventQuery}
              onChangeText={setEventQuery}
              autoCapitalize="none"
              autoCorrect={false}
              icon={<Search size={16} color="#999" strokeWidth={2.2} />}
              containerStyle={styles.searchInput}
            />

            {eventsLoading ? (
              <View style={styles.eventsLoadingWrap}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : eventsError ? (
              <Text style={styles.errorText}>{eventsError}</Text>
            ) : filteredEvents.length === 0 ? (
              <View style={styles.eventsEmptyWrap}>
                <CalendarDays size={40} color="#ccc" strokeWidth={1.6} />
                <Text style={styles.emptyText}>
                  No events found. Create one to get started.
                </Text>
              </View>
            ) : (
              filteredEvents.map((event) => (
                <CommunityEventCard
                  key={`${event.communityId || "general"}-${event.id}`}
                  event={event}
                  onPress={() => openEvent(event)}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={categoryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCategoryModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Filter by category</Text>
            <Text style={styles.modalBody}>Choose one category to show.</Text>

            <ScrollView
              style={styles.categoryList}
              showsVerticalScrollIndicator={false}
            >
              {categories.map((category) => {
                const selected = categoryFilter === category;
                return (
                  <Pressable
                    key={category}
                    style={[
                      styles.categoryOption,
                      selected && styles.categoryOptionSelected,
                    ]}
                    onPress={() => {
                      setCategoryFilter(category);
                      setCategoryModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        selected && styles.categoryOptionTextSelected,
                      ]}
                    >
                      {category}
                    </Text>
                    {selected && (
                      <Check
                        size={18}
                        color={Colors.primary}
                        strokeWidth={2.6}
                      />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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
  container: {
    flex: 1,
    backgroundColor: Colors.light,
    paddingTop: 0,
  },
  ctaRow: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  ctaCopy: {
    flex: 1,
  },
  headerImage: {
    width: "100%",
    height: 58,
  },
  tabSwitchWrap: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    flexDirection: "row",
    backgroundColor: "#f9f9f9",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    padding: 4,
    gap: 4,
  },
  tabSwitchBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  tabSwitchBtnActive: {
    backgroundColor: Colors.primary,
  },
  tabSwitchTx: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: Colors.dark,
  },
  tabSwitchTxActive: {
    color: "#fff",
  },
  communitiesContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 22,
    fontFamily: Fonts.gabarito.semiBold,
    color: Colors.dark,
  },
  searchInput: {
    marginBottom: 12,
  },
  categorySelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 10,
  },
  categorySelectorLabel: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#888",
    marginBottom: 2,
  },
  categorySelectorValue: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.dark,
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  visibilityChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    backgroundColor: "#fff",
    alignItems: "center",
    paddingVertical: 9,
  },
  visibilityChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  visibilityChipText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.dark,
  },
  visibilityChipTextActive: {
    color: "#fff",
  },
  loader: {
    marginTop: 32,
  },
  communitySkeletonCard: {
    gap: 12,
    padding: 16,
  },
  communitySkeletonTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  errorText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
    marginTop: 24,
  },
  emptyText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginTop: 24,
  },
  eventsLoadingWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  eventsEmptyWrap: {
    alignItems: "center",
    gap: 10,
    paddingTop: 28,
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
  eventDateBadge: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.primary + "14",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventDateDay: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.primary,
    lineHeight: 22,
  },
  eventDateMonth: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 10,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  eventBody: {
    flex: 1,
    gap: 4,
  },
  eventCommunityName: {
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
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  eventMetaText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  modalCard: {
    width: "100%",
    maxHeight: "70%",
    borderRadius: 20,
    backgroundColor: "#fff",
    padding: 20,
  },
  modalTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.dark,
    textAlign: "center",
  },
  modalBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  categoryList: {
    marginHorizontal: -4,
  },
  categoryOption: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryOptionSelected: {
    backgroundColor: Colors.primary + "12",
  },
  categoryOptionText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.dark,
  },
  categoryOptionTextSelected: {
    color: Colors.primary,
  },
});
