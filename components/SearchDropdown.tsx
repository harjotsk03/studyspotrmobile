import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CalendarDays, MapPin, Users } from "lucide-react-native";
import { API_BASE_URL } from "../constants/Api";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import { useSearchState } from "../context/SearchStateContext";
import { useSpots, type StudySpot } from "../context/SpotsContext";
import type { CommunityData } from "../screens/CommunityDetailScreen";
import { navigationRef } from "../navigation/rootNavigation";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import { getSpotDescription } from "../utils/getSpotDescription";
import { getSpotSearchText } from "../utils/getSpotSearchText";
import { getSpotTitle } from "../utils/getSpotTitle";

type Tab = "people" | "communities" | "events" | "spots";

const TABS: { key: Tab; label: string }[] = [
  { key: "people", label: "People" },
  { key: "communities", label: "Communities" },
  { key: "events", label: "Events" },
  { key: "spots", label: "Spots" },
];

const TAB_ROW_PADDING = 8;
const DEBOUNCE_MS = 250;
const FETCH_LIMIT = 20;

type UserResult = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo?: string | null;
};

type CommunityResult = {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  category?: string | null;
  is_public?: boolean;
  member_count?: number;
  user_role?: string | null;
};

type EventResult = {
  id: string;
  title: string;
  start_time: string;
  community_id?: string | null;
  community_name?: string | null;
  community_is_public?: boolean;
  user_community_role?: string | null;
};

function userDisplayName(u: UserResult) {
  const full = [u.first_name, u.last_name]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ")
    .trim();
  return full || u.username || "User";
}

function formatEventWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} · ${d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

async function fetchJson(url: string, token: string, signal: AbortSignal) {
  const res = await fetch(url, {
    signal,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Search failed.");
  return data;
}

/**
 * Full-width dropdown that hangs from the top bar while the search field is
 * open and has text. Mounted once at the app root so it overlays any tab and
 * every result stays tappable.
 */
export default function SearchDropdown() {
  const { token } = useAuth();
  const { spots } = useSpots();
  const { query, searchOpen, dropdownTop, requestCloseSearch } =
    useSearchState();

  const trimmed = query.trim();
  // `dismissed` hides the panel instantly once a result is picked, so it never
  // draws over the incoming screen while the push transition runs.
  const [dismissed, setDismissed] = useState(false);
  const closingRef = useRef(false);
  const visible = searchOpen && trimmed.length > 0 && !dismissed;

  useEffect(() => {
    if (!searchOpen) {
      setDismissed(false);
      closingRef.current = false;
    }
  }, [searchOpen]);

  const [tab, setTab] = useState<Tab>("people");
  const [tabRowWidth, setTabRowWidth] = useState(0);
  // Sliding underline: springs to the active tab's slot.
  const indicatorX = useRef(new Animated.Value(0)).current;
  // Results slide/fade in from the direction of the tab you moved to.
  const contentX = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const tabWidth = tabRowWidth > 0 ? (tabRowWidth - TAB_ROW_PADDING * 2) / TABS.length : 0;

  const selectTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      const from = TABS.findIndex((t) => t.key === tab);
      const to = TABS.findIndex((t) => t.key === next);
      setTab(next);

      Animated.spring(indicatorX, {
        toValue: to * tabWidth,
        useNativeDriver: true,
        damping: 20,
        stiffness: 240,
        mass: 0.8,
      }).start();

      contentX.setValue(to > from ? 28 : -28);
      contentOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(contentX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 260,
          mass: 0.8,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    },
    [tab, tabWidth, indicatorX, contentX, contentOpacity],
  );

  const [loading, setLoading] = useState(false);
  // The query the current server results belong to (guards the auto-switch
  // below against acting on stale results from the previous query).
  const [settledFor, setSettledFor] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [communities, setCommunities] = useState<CommunityResult[]>([]);
  const [events, setEvents] = useState<EventResult[]>([]);
  const [failed, setFailed] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  // Open/close animation (drop down from the top bar).
  const appear = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(appear, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(appear, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, appear]);

  // Keep the panel above the keyboard.
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    // Frozen while closing so the panel doesn't jump as the keyboard retracts.
    const show = Keyboard.addListener(showEvt, (e) => {
      if (!closingRef.current) setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      if (!closingRef.current) setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Spots are already loaded app-wide, so match them locally.
  const spotResults = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (!q) return [] as StudySpot[];
    return spots
      .filter((s) => getSpotSearchText(s).includes(q))
      .sort((a, b) => {
        const aStarts = getSpotTitle(a).toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = getSpotTitle(b).toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts;
      })
      .slice(0, FETCH_LIMIT);
  }, [spots, trimmed]);

  useEffect(() => {
    controllerRef.current?.abort();

    if (!trimmed || !token || !searchOpen) {
      setUsers([]);
      setCommunities([]);
      setEvents([]);
      setFailed(false);
      setLoading(false);
      setSettledFor("");
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;
      const params = new URLSearchParams({
        q: trimmed,
        limit: String(FETCH_LIMIT),
      }).toString();
      const base = `${API_BASE_URL}/api/v1/search`;

      // Each category is independent: one failing (e.g. users rejects some
      // punctuation) must not blank out the others.
      const [u, c, e] = await Promise.allSettled([
        fetchJson(`${base}/search-users?${params}`, token, controller.signal),
        fetchJson(
          `${base}/search-communities?${params}`,
          token,
          controller.signal,
        ),
        fetchJson(`${base}/search-events?${params}`, token, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      setUsers(u.status === "fulfilled" ? (u.value?.users ?? []) : []);
      setCommunities(
        c.status === "fulfilled" ? (c.value?.communities ?? []) : [],
      );
      setEvents(e.status === "fulfilled" ? (e.value?.events ?? []) : []);
      setFailed(
        u.status === "rejected" &&
          c.status === "rejected" &&
          e.status === "rejected",
      );
      setSettledFor(trimmed);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, token, searchOpen]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // ── Navigation per result type ──────────────────────────────────────────

  // Backdrop tap: fade the panel out and let the bar run its close animation.
  const finish = useCallback(() => {
    closingRef.current = true;
    Keyboard.dismiss();
    requestCloseSearch();
  }, [requestCloseSearch]);

  // Result picked: hide the panel at once (no fade over the incoming screen),
  // start the screen push, and only then collapse the search bar — by that
  // point it's covered by the new screen, so nothing visibly jumps.
  const pick = useCallback(
    (go: () => void) => {
      closingRef.current = true;
      appear.stopAnimation();
      appear.setValue(0);
      setMounted(false);
      setDismissed(true);
      Keyboard.dismiss();
      go();
      setTimeout(() => requestCloseSearch(), 450);
    },
    [appear, requestCloseSearch],
  );

  const openUser = useCallback(
    (u: UserResult) => {
      pick(() => navigationRef.navigate("PublicProfile", { userId: u.id }));
    },
    [pick],
  );

  const openSpot = useCallback(
    (spot: StudySpot) => {
      pick(() => navigationRef.navigate("SpotViewer", { spot }));
    },
    [pick],
  );

  const openCommunity = useCallback(
    (c: CommunityResult) => {
      const community: CommunityData = {
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        members: c.member_count ?? 0,
        icon: c.avatar_url ?? undefined,
        avatar_url: c.avatar_url ?? undefined,
        banner_url: c.banner_url ?? undefined,
        color: Colors.primary,
        category: c.category ?? undefined,
        is_public: c.is_public,
        user_role: c.user_role ?? undefined,
        memberAvatars: [],
      };
      pick(() => navigationRef.navigate("CommunityDetail", { community }));
    },
    [pick],
  );

  const openEvent = useCallback(
    (e: EventResult) => {
      pick(() => {
        if (e.community_id) {
          const role = e.user_community_role ?? undefined;
          navigationRef.navigate("CommunityEvents", {
            communityId: e.community_id,
            communityName: e.community_name ?? "",
            isAdmin: role === "owner" || role === "admin",
            communityIsPublic: e.community_is_public ?? true,
            userCommunityRole: role,
            openEventId: e.id,
            openEventNonce: Date.now(),
          });
          return;
        }
        // Standalone event: the Community tab opens it in its event drawer.
        navigationRef.navigate("MainTabs", {
          screen: "Community",
          params: {
            screen: "CommunityList",
            params: { openEventId: e.id, openEventNonce: Date.now() },
          },
        });
      });
    },
    [pick],
  );

  // Once a search finishes: if the tab you're on came back empty but another
  // has results, slide to the first one that does. Runs once per finished
  // search, so it never fights a tab you picked yourself.
  useEffect(() => {
    if (!visible || loading || failed || settledFor !== trimmed) return;
    const found: Record<Tab, number> = {
      people: users.length,
      communities: communities.length,
      events: events.length,
      spots: spotResults.length,
    };
    if (found[tab] > 0) return;
    const first = TABS.find((t) => found[t.key] > 0);
    if (first) selectTab(first.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledFor, visible]);

  if (!mounted) return null;

  const counts: Record<Tab, number> = {
    people: users.length,
    communities: communities.length,
    events: events.length,
    spots: spotResults.length,
  };
  const activeCount = counts[tab];
  const showEmpty = !loading && !failed && activeCount === 0;

  const translateY = appear.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 0],
  });

  return (
    <View
      style={[styles.overlay, { top: dropdownTop, bottom: keyboardHeight }]}
      pointerEvents="box-none"
    >
      {/* Tap outside the panel to dismiss. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: appear }]}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={finish}
          accessibilityLabel="Close search"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { opacity: appear, transform: [{ translateY }] },
        ]}
      >
        <View
          style={styles.tabRow}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setTabRowWidth(w);
            // Snap the indicator to the active slot after (re)layout.
            const slot = (w - TAB_ROW_PADDING * 2) / TABS.length;
            indicatorX.setValue(
              TABS.findIndex((t) => t.key === tab) * slot,
            );
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = counts[t.key];
            return (
              <Pressable
                key={t.key}
                onPress={() => selectTab(t.key)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t.label}
                  {count > 0 ? ` ${count}` : ""}
                </Text>
              </Pressable>
            );
          })}
          {tabWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tabIndicator,
                {
                  width: tabWidth - 16,
                  transform: [{ translateX: indicatorX }],
                },
              ]}
            />
          ) : null}
        </View>

        <Animated.ScrollView
          style={[
            styles.results,
            { opacity: contentOpacity, transform: [{ translateX: contentX }] },
          ]}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading && activeCount === 0 ? (
            <ActivityIndicator style={styles.spinner} color={Colors.primary} />
          ) : null}

          {failed ? (
            <Text style={styles.stateText}>
              Couldn't search right now. Check your connection and try again.
            </Text>
          ) : null}

          {showEmpty ? (
            <Text style={styles.stateText}>
              No {TABS.find((t) => t.key === tab)?.label.toLowerCase()} found
              for “{trimmed}”.
            </Text>
          ) : null}

          {tab === "people"
            ? users.map((u) => {
                const name = userDisplayName(u);
                const avatarUser = {
                  id: u.id,
                  username: u.username ?? undefined,
                  first_name: u.first_name ?? undefined,
                  last_name: u.last_name ?? undefined,
                  name,
                };
                const photo =
                  typeof u.profile_photo === "string" && u.profile_photo.trim()
                    ? u.profile_photo
                    : null;
                return (
                  <ResultRow
                    key={u.id}
                    title={name}
                    subtitle={u.username ? `@${u.username}` : "StudySpotr user"}
                    onPress={() => openUser(u)}
                    left={
                      photo ? (
                        <Image source={{ uri: photo }} style={styles.avatar} />
                      ) : (
                        <View
                          style={[
                            styles.avatar,
                            styles.center,
                            { backgroundColor: getUserAvatarColor(avatarUser) },
                          ]}
                        >
                          <Text style={styles.avatarInitial}>
                            {getUserInitials(avatarUser)}
                          </Text>
                        </View>
                      )
                    }
                  />
                );
              })
            : null}

          {tab === "communities"
            ? communities.map((c) => {
                const members = c.member_count ?? 0;
                return (
                  <ResultRow
                    key={c.id}
                    title={c.name}
                    subtitle={`${members} ${members === 1 ? "member" : "members"}${
                      c.is_public === false ? " · Private" : ""
                    }`}
                    onPress={() => openCommunity(c)}
                    left={
                      c.avatar_url ? (
                        <Image
                          source={{ uri: c.avatar_url }}
                          style={styles.squareThumb}
                        />
                      ) : (
                        <IconThumb>
                          <Users size={22} color={Colors.primary} />
                        </IconThumb>
                      )
                    }
                  />
                );
              })
            : null}

          {tab === "events"
            ? events.map((e) => (
                <ResultRow
                  key={e.id}
                  title={e.title}
                  subtitle={[formatEventWhen(e.start_time), e.community_name ?? null]
                    .filter(Boolean)
                    .join(" · ")}
                  onPress={() => openEvent(e)}
                  left={
                    <IconThumb>
                      <CalendarDays size={22} color={Colors.primary} />
                    </IconThumb>
                  }
                />
              ))
            : null}

          {tab === "spots"
            ? spotResults.map((s) => {
                const img =
                  typeof s.image_url === "string" && s.image_url.trim()
                    ? s.image_url
                    : null;
                return (
                  <ResultRow
                    key={s.id}
                    title={getSpotTitle(s)}
                    subtitle={
                      typeof s.address === "string" && s.address.trim()
                        ? s.address
                        : getSpotDescription(s)
                    }
                    onPress={() => openSpot(s)}
                    left={
                      img ? (
                        <Image source={{ uri: img }} style={styles.squareThumb} />
                      ) : (
                        <IconThumb>
                          <MapPin size={22} color={Colors.primary} />
                        </IconThumb>
                      )
                    }
                  />
                );
              })
            : null}
        </Animated.ScrollView>
      </Animated.View>
    </View>
  );
}

function IconThumb({ children }: { children: React.ReactNode }) {
  return (
    <View style={[styles.squareThumb, styles.thumbBg, styles.center]}>
      {children}
    </View>
  );
}

function ResultRow({
  left,
  title,
  subtitle,
  onPress,
}: {
  left: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {left}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 50,
  },
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  panel: {
    // Full width, hugs its content, never taller than the space above the keyboard.
    maxHeight: "100%",
    backgroundColor: Colors.light,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: TAB_ROW_PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E6E6",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 13,
  },
  tabText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#8C8C8C",
  },
  tabTextActive: { color: Colors.primary },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: TAB_ROW_PADDING + 8,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  results: { flexGrow: 0, flexShrink: 1 },
  resultsContent: { paddingHorizontal: 20, paddingVertical: 6 },
  spinner: { marginVertical: 24 },
  stateText: {
    marginVertical: 24,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  rowPressed: { opacity: 0.6 },
  rowCopy: { flex: 1, justifyContent: "center" },
  rowTitle: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  rowSubtitle: {
    marginTop: 2,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#8D8D8D",
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarInitial: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 19,
  },
  squareThumb: { width: 48, height: 48, borderRadius: 12 },
  thumbBg: { backgroundColor: "#E8F0F9" },
  center: { alignItems: "center", justifyContent: "center" },
});
