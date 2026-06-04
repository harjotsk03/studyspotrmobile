import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Globe,
  Send,
  UserCheck,
  Users,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import { SkeletonList, SkeletonRow } from "../components/Skeleton";
import type { CommunityStackParamList } from "./CommunityDetailScreen";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import type { RootStackParamList } from "../types/navigation";

interface MemberUser {
  id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  profile_photo?: string;
}

interface Member {
  user: MemberUser;
  role: string | null;
  status: "pending" | "accepted";
}

type Props = NativeStackScreenProps<CommunityStackParamList, "InviteEvent">;

const AVATAR_SIZE = 46;

function displayName(user: MemberUser) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fullName || user.username || "Unknown";
}

function Avatar({ user }: { user: MemberUser }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const name = displayName(user);

  return (
    <Pressable
      onPress={() => navigation.navigate("PublicProfile", { userId: user.id })}
      style={[
        styles.avatar,
        { backgroundColor: getUserAvatarColor({ ...user, name }) },
      ]}
    >
      {user.profile_photo ? (
        <Image source={{ uri: user.profile_photo }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitial}>
          {getUserInitials({ ...user, name })}
        </Text>
      )}
    </Pressable>
  );
}

function InviteRow({
  member,
  selected,
  onToggle,
}: {
  member: Member;
  selected: boolean;
  onToggle: () => void;
}) {
  const name = displayName(member.user);

  return (
    <Pressable style={styles.memberRow} onPress={onToggle}>
      <Avatar user={member.user} />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>
          {name}
        </Text>
        {!!member.user.username && (
          <Text style={styles.username} numberOfLines={1}>
            @{member.user.username}
          </Text>
        )}
      </View>
      <View style={[styles.invitePill, selected && styles.invitePillSelected]}>
        {selected && <Check size={13} color="#fff" strokeWidth={3} />}
        <Text style={[styles.inviteText, selected && styles.inviteTextSelected]}>
          {selected ? "Selected" : "Invite"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function InviteEventScreen({ route }: Props) {
  const { communityId, communityName, eventId, eventTitle } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token, profile } = useAuth();
  const currentUser = profile?.userProfile;

  const [members, setMembers] = useState<Member[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<MemberUser[]>([]);
  const [communityIsPublic, setCommunityIsPublic] = useState<boolean | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [audience, setAudience] = useState<"members" | "all">("members");
  const [joinedSelf, setJoinedSelf] = useState(false);
  const [joiningSelf, setJoiningSelf] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  // Inline banners shown above the list — replaces the previous Alert
  // dialogs so success/failure don't yank the user out of the flow.
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState<number | null>(null);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [headerOpacity]);

  // Drive the inline banner's fade in/out whenever either banner state
  // changes. Showing one supersedes the other, so we always animate to
  // visible while a banner is set and to hidden while both are clear.
  useEffect(() => {
    const visible = !!inviteError || inviteSuccess !== null;
    Animated.timing(bannerOpacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [bannerOpacity, inviteError, inviteSuccess]);

  const acceptedMembers = useMemo(
    () => members.filter((member) => member.status === "accepted"),
    [members],
  );

  const selfMember = useMemo(() => {
    if (!currentUser?.id) return null;

    const fromMembers = acceptedMembers.find(
      (member) => member.user.id === currentUser.id,
    );

    if (fromMembers) return fromMembers;

    return {
      role: null,
      status: "accepted" as const,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        first_name: currentUser.first_name,
        last_name: currentUser.last_name,
        profile_photo: currentUser.profile_photo,
      },
    };
  }, [acceptedMembers, currentUser]);

  const inviteMembers = useMemo(
    () =>
      acceptedMembers.filter(
        (member) => member.user.id !== currentUser?.id,
      ),
    [acceptedMembers, currentUser?.id],
  );

  // Community members shown as `Member` objects. For the "All users"
  // segment (public communities only) we wrap each suggested user in
  // the same `Member` shape so the row renderer can stay agnostic.
  const otherInvitees = useMemo<Member[]>(() => {
    if (communityIsPublic !== true) return [];
    const memberIds = new Set(inviteMembers.map((m) => m.user.id));
    return suggestedUsers
      .filter((u) => u.id && u.id !== currentUser?.id && !memberIds.has(u.id))
      .map((user) => ({ user, role: null, status: "accepted" as const }));
  }, [communityIsPublic, suggestedUsers, inviteMembers, currentUser?.id]);

  // Data backing the active list. "Members" is always available; "All
  // users" is only meaningful for public communities and is hidden via
  // the segmented control otherwise.
  const visibleList = audience === "members" ? inviteMembers : otherInvitees;
  const showSegmented =
    communityIsPublic === true &&
    (otherInvitees.length > 0 || loadingSuggested);

  const allSelected =
    visibleList.length > 0 &&
    visibleList.every((member) => selectedIds.has(member.user.id));

  const fetchMembers = useCallback(
    async (isRefresh = false) => {
      if (!token) return;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/communities/${communityId}/members?limit=200`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setMembers(json.members ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load members.",
        );
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [communityId, token],
  );

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  // Pull the community's visibility once so we know whether the "All
  // users" segment makes sense. The backend rule is: public events let
  // *any* existing user be invited, private events require accepted
  // community membership. We fall back to "private" if the field is
  // missing to stay safe.
  useEffect(() => {
    if (!token || !communityId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/communities/${communityId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = await res.json().catch(() => null);
        if (cancelled || !res.ok || !json) return;
        const community =
          (json as { community?: { is_public?: unknown } }).community ?? json;
        const isPublic =
          typeof (community as { is_public?: unknown })?.is_public === "boolean"
            ? Boolean((community as { is_public?: boolean }).is_public)
            : false;
        setCommunityIsPublic(isPublic);
      } catch {
        if (!cancelled) setCommunityIsPublic(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [communityId, token]);

  // Pull a small pool of suggested users to power the "All users"
  // segment for public communities. We don't need to be exhaustive —
  // this is meant to spark obvious invitee choices alongside community
  // members. Skipped entirely on private communities to avoid the
  // backend rejecting the invite later.
  useEffect(() => {
    if (!token || communityIsPublic !== true) return;
    let cancelled = false;
    setLoadingSuggested(true);
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/users/fetch-suggested-users?limit=100&offset=0`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = await res.json().catch(() => null);
        if (cancelled || !res.ok) return;
        const rawUsers = Array.isArray((json as { users?: unknown[] })?.users)
          ? ((json as { users: unknown[] }).users as unknown[])
          : [];
        const parsed: MemberUser[] = [];
        for (const u of rawUsers) {
          if (!u || typeof u !== "object") continue;
          const obj = u as Record<string, unknown>;
          const id = typeof obj.id === "string" ? obj.id.trim() : "";
          if (!id) continue;
          parsed.push({
            id,
            username: typeof obj.username === "string" ? obj.username : undefined,
            first_name:
              typeof obj.first_name === "string" ? obj.first_name : undefined,
            last_name:
              typeof obj.last_name === "string" ? obj.last_name : undefined,
            profile_photo:
              typeof obj.profile_photo === "string"
                ? obj.profile_photo
                : undefined,
          });
        }
        if (!cancelled) setSuggestedUsers(parsed);
      } catch {
        if (!cancelled) setSuggestedUsers([]);
      } finally {
        if (!cancelled) setLoadingSuggested(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [communityIsPublic, token]);

  function toggleMember(userId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      // "All selected" is scoped to whichever list is currently visible
      // — toggling it should add or remove just that segment's IDs, not
      // wipe selections in the other segment.
      const next = new Set(current);
      if (allSelected) {
        visibleList.forEach((member) => next.delete(member.user.id));
      } else {
        visibleList.forEach((member) => next.add(member.user.id));
      }
      return next;
    });
  }

  // Switching audience clears any inline error so the next attempt
  // starts from a clean slate; selections persist intentionally.
  function switchAudience(next: "members" | "all") {
    if (next === audience) return;
    setAudience(next);
    if (inviteError) setInviteError("");
  }

  async function handleJoinSelf() {
    if (!token || joinedSelf) return;

    setJoiningSelf(true);
    setInviteError("");
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/events/${eventId}/join`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(json?.error ?? json?.message ?? "Could not join event.");
      }

      setJoinedSelf(true);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Could not join — please try again.",
      );
    } finally {
      setJoiningSelf(false);
    }
  }

  async function handleSendInvites() {
    if (!token) return;
    // Drop empty / falsy / self ids defensively — the backend treats
    // these as bad request and returns a 4xx, which would surface as a
    // confusing error to the user.
    const userIds = Array.from(selectedIds).filter(
      (id) => typeof id === "string" && id.trim().length > 0 && id !== currentUser?.id,
    );
    if (userIds.length === 0) {
      setInviteError("Select at least one user to invite.");
      return;
    }

    setSendingInvites(true);
    setInviteError("");
    setInviteSuccess(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/events/${eventId}/invite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ user_ids: userIds }),
        },
      );
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          json?.error ?? json?.message ?? "Could not send event invites.",
        );
      }

      // Backend may report a partial / actual invited count; fall back
      // to what the user selected so we don't lie when the count is
      // missing from the response.
      const reported =
        typeof json?.invited === "number"
          ? (json.invited as number)
          : typeof json?.count === "number"
            ? (json.count as number)
            : userIds.length;

      setInviteSuccess(reported);
      setSelectedIds(new Set());
      // Give the user a beat to see the confirmation, then bounce back
      // to the previous screen automatically.
      setTimeout(() => {
        navigation.goBack();
      }, 1100);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Invite failed. Please try again.",
      );
    } finally {
      setSendingInvites(false);
    }
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

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {communityIsPublic ? "Invite People" : "Invite Members"}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {communityName}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.skipButton}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.heroCard, { opacity: headerOpacity }]}>
        <Text style={styles.heroEyebrow}>Event created</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {eventTitle}
        </Text>
        <Text style={styles.heroBody}>
          Invite community members now, or skip and come back later.
        </Text>
      </Animated.View>

      {selfMember && (
        <View style={styles.selfCard}>
          <Avatar user={selfMember.user} />
          <View style={styles.memberInfo}>
            <Text style={styles.selfLabel}>You</Text>
            <Text style={styles.memberName} numberOfLines={1}>
              {displayName(selfMember.user)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.joinSelfButton, joinedSelf && styles.joinedSelfButton]}
            activeOpacity={0.75}
            onPress={() => void handleJoinSelf()}
            disabled={joiningSelf || joinedSelf}
          >
            {joiningSelf ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : joinedSelf ? (
              <>
                <UserCheck size={14} color="#16A34A" strokeWidth={2.5} />
                <Text style={styles.joinedSelfText}>Joined</Text>
              </>
            ) : (
              <Text style={styles.joinSelfText}>Join myself</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {(!!inviteError || inviteSuccess !== null) && (
        <Animated.View
          style={[
            styles.banner,
            inviteError ? styles.bannerError : styles.bannerSuccess,
            { opacity: bannerOpacity },
          ]}
        >
          {inviteError ? (
            <AlertCircle size={18} color="#B91C1C" strokeWidth={2.2} />
          ) : (
            <CheckCircle2 size={18} color="#15803D" strokeWidth={2.2} />
          )}
          <Text
            style={[
              styles.bannerText,
              inviteError ? styles.bannerTextError : styles.bannerTextSuccess,
            ]}
          >
            {inviteError
              ? inviteError
              : `${inviteSuccess} ${
                  inviteSuccess === 1 ? "invite" : "invites"
                } sent`}
          </Text>
        </Animated.View>
      )}

      {showSegmented && (
        <View style={styles.segmentRow}>
          <Pressable
            style={[
              styles.segmentBtn,
              audience === "members" && styles.segmentBtnActive,
            ]}
            onPress={() => switchAudience("members")}
          >
            <Users
              size={14}
              color={audience === "members" ? "#fff" : "#666"}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.segmentText,
                audience === "members" && styles.segmentTextActive,
              ]}
            >
              Members
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.segmentBtn,
              audience === "all" && styles.segmentBtnActive,
            ]}
            onPress={() => switchAudience("all")}
          >
            <Globe
              size={14}
              color={audience === "all" ? "#fff" : "#666"}
              strokeWidth={2.2}
            />
            <Text
              style={[
                styles.segmentText,
                audience === "all" && styles.segmentTextActive,
              ]}
            >
              All users
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.listHeader}>
        <View>
          <Text style={styles.listTitle}>
            {audience === "members" ? "Community members" : "Suggested users"}
          </Text>
          <Text style={styles.listSubtitle}>
            {visibleList.length.toLocaleString()} available to invite
            {selectedIds.size > 0
              ? ` • ${selectedIds.size} selected`
              : ""}
          </Text>
        </View>
        <Pressable
          style={[styles.selectAllButton, allSelected && styles.selectAllActive]}
          onPress={toggleSelectAll}
          disabled={visibleList.length === 0}
        >
          <Text
            style={[
              styles.selectAllText,
              allSelected && styles.selectAllActiveText,
            ]}
          >
            {allSelected ? "Clear all" : "Select all"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <SkeletonList
          count={7}
          style={styles.listContent}
          row={<SkeletonRow avatarSize={AVATAR_SIZE} lines={2} actions />}
        />
      ) : error ? (
        <View style={styles.centeredBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => fetchMembers()}
            style={styles.retryButton}
            activeOpacity={0.7}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visibleList}
          keyExtractor={(item) => item.user.id}
          renderItem={({ item }) => (
            <InviteRow
              member={item}
              selected={selectedIds.has(item.user.id)}
              onToggle={() => toggleMember(item.user.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            audience === "all" && loadingSuggested ? (
              <View style={styles.centeredBox}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.emptySubtitle}>Loading users…</Text>
              </View>
            ) : (
              <View style={styles.centeredBox}>
                <Users size={44} color="#CCC" strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>
                  {audience === "members"
                    ? "No one else to invite"
                    : "No additional users to suggest"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {audience === "members"
                    ? "You are the only accepted member in this community right now."
                    : "Try switching back to the members tab, or check back later."}
                </Text>
              </View>
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchMembers(true)}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Button
          label={
            selectedIds.size === 0
              ? "Select people to invite"
              : `Send ${selectedIds.size} ${selectedIds.size === 1 ? "Invite" : "Invites"}`
          }
          icon={
            inviteSuccess !== null ? (
              <CheckCircle2 size={18} color="#fff" strokeWidth={2.3} />
            ) : (
              <Send size={18} color="#fff" strokeWidth={2.3} />
            )
          }
          fullWidth
          disabled={selectedIds.size === 0 || inviteSuccess !== null}
          loading={sendingInvites}
          onPress={() => void handleSendInvites()}
        />
      </View>
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
  skipButton: {
    minWidth: 40,
    alignItems: "flex-end",
    paddingVertical: 8,
  },
  skipText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: Colors.primary,
  },
  heroCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 16,
  },
  heroEyebrow: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    lineHeight: 27,
  },
  heroBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
    lineHeight: 20,
    marginTop: 8,
  },
  selfCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 19,
    color: "#fff",
  },
  memberInfo: {
    flex: 1,
    gap: 1,
  },
  selfLabel: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  memberName: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  username: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
  },
  joinSelfButton: {
    minWidth: 108,
    height: 38,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 5,
  },
  joinSelfText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: "#fff",
  },
  joinedSelfButton: {
    backgroundColor: "#DCFCE7",
  },
  joinedSelfText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: "#16A34A",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  bannerSuccess: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  bannerText: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  bannerTextError: {
    color: "#B91C1C",
  },
  bannerTextSuccess: {
    color: "#15803D",
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#EFEFEF",
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: "#666",
  },
  segmentTextActive: {
    color: "#fff",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  listTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  listSubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  selectAllButton: {
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E6E6E6",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectAllActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectAllText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: Colors.dark,
  },
  selectAllActiveText: {
    color: "#fff",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  invitePill: {
    minWidth: 84,
    height: 34,
    borderRadius: 999,
    backgroundColor: Colors.light,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 5,
  },
  invitePillSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  inviteText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: Colors.dark,
  },
  inviteTextSelected: {
    color: "#fff",
  },
  separator: {
    height: 1,
    backgroundColor: "#F4F4F4",
    marginLeft: 80,
  },
  loader: {
    marginTop: 48,
  },
  centeredBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 72,
    gap: 10,
  },
  errorText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#fff",
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
  listContent: {
    paddingBottom: 110,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
});
