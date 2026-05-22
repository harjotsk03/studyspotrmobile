import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  ArrowLeft,
  CalendarDays,
  Globe,
  Info,
  Lock,
  LogOut,
  Pencil,
  Send,
  Share,
  Tag,
  Trash2,
  Users,
} from "lucide-react-native";
import type {
  NavigationProp,
  ParamListBase,
} from "@react-navigation/native";
import ShareToFriendsSheet from "../components/ShareToFriendsSheet";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import { useCommunityMembershipVersion } from "../context/NotificationsContext";
import {
  fetchCommunityMembership,
  isCommunityAdminOrOwner,
  isCommunityOwner,
  normalizeCommunityMembership,
  type CommunityMembershipSnapshot,
} from "../utils/communityMembership";
import Button from "../components/Button";
import { SkeletonBox } from "../components/Skeleton";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

export interface CommunityLatestMember {
  id?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  profile_photo?: string;
  avatar_url?: string;
}

export interface CommunityData {
  id: string;
  name: string;
  members: number;
  description: string;
  icon?: string;
  avatar_url?: string;
  banner_url?: string;
  created_by?: string;
  color: string;
  category?: string;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
  user_role?: string;
  /** 'pending' while awaiting admin approval; 'accepted' once in the community */
  user_membership_status?: "pending" | "accepted";
  latestMembers?: CommunityLatestMember[];
  memberAvatars: string[];
  /** Raw API fields — present after the detail fetch is resolved */
  is_member?: boolean;
  is_pending?: boolean;
  my_role?: string;
  membership_status?: string;
}

export type CommunityStackParamList = {
  CommunityList: undefined;
  CommunityDetail: {
    community: CommunityData;
    openMembers?: boolean;
    highlightMemberUserId?: string;
  };
  CommunityInfo: { community: CommunityData };
  CreateCommunity: undefined;
  EditCommunity: { community: CommunityData };
  CommunityEvents: {
    communityId: string;
    communityName: string;
    isAdmin: boolean;
    communityIsPublic: boolean;
    userCommunityRole?: string;
    /** Optional: opens the EventDetailDrawer for this event id as soon as
     * the list mounts. Used by shared-event preview cards in chat. */
    openEventId?: string;
  };
  CreateEvent: {
    communityId?: string;
    communityName?: string;
  };
  InviteEvent: {
    communityId: string;
    communityName: string;
    eventId: string;
    eventTitle: string;
  };
  CommunityMembers: {
    communityId: string;
    communityName: string;
    isAdmin: boolean;
    highlightUserId?: string;
  };
};

type Props = NativeStackScreenProps<CommunityStackParamList, "CommunityDetail">;

const ICON_SIZE = 72;

function CommunityDetailSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <SkeletonBox
        width="100%"
        height={160}
        radius={0}
        style={styles.skeletonBanner}
      />
      <View style={styles.infoSection}>
        <View style={styles.skeletonIconBox}>
          <SkeletonBox width={ICON_SIZE} height={ICON_SIZE} radius={16} />
        </View>
        <SkeletonBox width="60%" height={26} radius={8} />
        <View style={styles.skeletonDescription}>
          <SkeletonBox width="100%" height={14} radius={7} />
          <SkeletonBox width="86%" height={14} radius={7} />
        </View>
        <View style={styles.skeletonMetaRow}>
          <SkeletonBox width={90} height={16} radius={8} />
          <SkeletonBox width={110} height={16} radius={8} />
          <SkeletonBox width={72} height={16} radius={8} />
        </View>
        <View style={styles.skeletonActionsRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBox key={index} width={70} height={70} radius={35} />
          ))}
        </View>
        <SkeletonBox width="100%" height={48} radius={12} />
      </View>
      <View style={styles.section}>
        <SkeletonBox width="35%" height={20} radius={8} />
        <View style={styles.skeletonDescription}>
          <SkeletonBox width="100%" height={14} radius={7} />
          <SkeletonBox width="94%" height={14} radius={7} />
          <SkeletonBox width="80%" height={14} radius={7} />
        </View>
      </View>
      <View style={styles.section}>
        <SkeletonBox width="45%" height={20} radius={8} />
        <View style={styles.skeletonDescription}>
          <SkeletonBox width="100%" height={14} radius={7} />
          <SkeletonBox width="70%" height={14} radius={7} />
        </View>
      </View>
    </View>
  );
}

type CommunityRouteSnapshot = CommunityData & {
  avatar_url?: string;
  member_count?: number;
};

export default function CommunityDetailScreen({ route }: Props) {
  const { community: initialCommunity } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [community, setCommunity] = useState<CommunityData>(initialCommunity);
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const communityId = initialCommunity.id;

  const fetchCommunity = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) {
        if (!opts?.silent) setFetching(false);
        return;
      }
      if (!opts?.silent) setFetching(true);
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
        const json = await res.json();
        if (res.ok) {
          const raw = json.community ?? json;
          const membership = normalizeCommunityMembership(raw);
          setCommunity((prev) => ({
            ...prev,
            ...raw,
            ...membership,
            // Detail endpoint returns `avatar_url`, but the renderer
            // reads `icon`. Alias so partial nav stubs (e.g. from the
            // inbox) get a real avatar after the fetch resolves.
            icon: raw.icon ?? raw.avatar_url ?? prev.icon,
            // Preserve member count if the API doesn't return one
            members: raw.members ?? raw.member_count ?? prev.members,
          }));
        }
      } catch {
        // keep the navigation-param snapshot on network error
      } finally {
        if (!opts?.silent) setFetching(false);
      }
    },
    [communityId, token],
  );

  const hasLoadedCommunityRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      void fetchCommunity({ silent: hasLoadedCommunityRef.current });
      hasLoadedCommunityRef.current = true;
    }, [fetchCommunity]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchCommunity({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [fetchCommunity]);

  // Silently refetch when this community's membership version bumps
  // (e.g. an admin/owner just accepted the user into the community).
  const membershipVersion = useCommunityMembershipVersion(communityId);
  const initialMembershipVersionRef = useRef(membershipVersion);
  useEffect(() => {
    if (membershipVersion === initialMembershipVersionRef.current) return;
    void fetchCommunity({ silent: true });
  }, [membershipVersion, fetchCommunity]);

  // Sync state when the edit screen navigates back with an updated community
  useEffect(() => {
    const next = route.params.community as CommunityRouteSnapshot;
    setCommunity((prev) => ({
      ...prev,
      ...next,
      icon: next.icon ?? next.avatar_url ?? prev.icon,
      banner_url: next.banner_url ?? prev.banner_url,
      color: next.color ?? prev.color,
      // Treat 0 / empty as "no value" so a partial param snapshot
      // (e.g. coming from the inbox) doesn't wipe out fetched data.
      members: next.members || next.member_count || prev.members,
      memberAvatars:
        next.memberAvatars && next.memberAvatars.length > 0
          ? next.memberAvatars
          : prev.memberAvatars,
      latestMembers:
        next.latestMembers && next.latestMembers.length > 0
          ? next.latestMembers
          : prev.latestMembers,
    }));
  }, [route.params.community]);

  const isAdmin =
    community.user_role === "owner" || community.user_role === "admin";

  const isOwner = community.user_role === "owner";

  // After fetch, is_member/is_pending come directly from the API.
  // Before fetch resolves, fall back to the mapped user_role/user_membership_status
  // from the nav-param snapshot so there's no flash.
  const isMember =
    community.is_member !== undefined
      ? community.is_member
      : !!community.user_role;

  const isPendingMember =
    community.is_pending !== undefined
      ? community.is_pending
      : community.user_membership_status === "pending" && !isMember;
  const canViewPrivateCommunityActions =
    community.is_public !== false || isMember;

  const applyMembership = useCallback(
    (membership: CommunityMembershipSnapshot) => {
      setCommunity((prev) => ({
        ...prev,
        ...membership,
      }));
    },
    [],
  );

  const refreshMembership = useCallback(async () => {
    if (!token) return null;
    try {
      const membership = await fetchCommunityMembership(token, communityId);
      applyMembership(membership);
      return membership;
    } catch {
      return null;
    }
  }, [applyMembership, communityId, token]);

  const ensureCommunityAccess = useCallback(
    async (requirement: "member" | "admin" | "owner") => {
      const membership = await refreshMembership();
      const currentMembership = membership ?? {
        is_member: isMember,
        is_pending: isPendingMember,
        my_role: community.user_role,
        user_role: community.user_role,
        membership_status: community.membership_status,
        user_membership_status: community.user_membership_status,
      };

      const allowed =
        requirement === "member"
          ? currentMembership.is_member
          : requirement === "owner"
            ? isCommunityOwner(currentMembership)
            : isCommunityAdminOrOwner(currentMembership);

      if (!allowed) {
        Alert.alert(
          "Access changed",
          requirement === "member"
            ? "You are no longer a member of this community."
            : "You no longer have permission to do that.",
        );
      }
      return allowed;
    },
    [
      community.membership_status,
      community.user_membership_status,
      community.user_role,
      isMember,
      isPendingMember,
      refreshMembership,
    ],
  );

  const handleOpenEditCommunity = useCallback(async () => {
    if (await ensureCommunityAccess("admin")) {
      navigation.navigate("EditCommunity", { community });
    }
  }, [community, ensureCommunityAccess, navigation]);

  const handleOpenEvents = useCallback(async () => {
    if (
      community.is_public === false &&
      !(await ensureCommunityAccess("member"))
    ) {
      return;
    }
    navigation.navigate("CommunityEvents", {
      communityId: community.id,
      communityName: community.name,
      isAdmin,
      communityIsPublic: community.is_public ?? true,
      userCommunityRole: community.user_role,
    });
  }, [community, ensureCommunityAccess, isAdmin, navigation]);

  const handleOpenMembers = useCallback(
    async (highlightUserId?: string) => {
      if (!(await ensureCommunityAccess("member"))) return;
      navigation.navigate("CommunityMembers", {
        communityId: community.id,
        communityName: community.name,
        isAdmin,
        highlightUserId,
      });
    },
    [community.id, community.name, ensureCommunityAccess, isAdmin, navigation],
  );

  const hasAutoOpenedMembersRef = useRef(false);
  const openMembersFlag = route.params.openMembers;
  const highlightMemberUserId = route.params.highlightMemberUserId;

  useEffect(() => {
    if (!openMembersFlag || fetching || hasAutoOpenedMembersRef.current) return;

    hasAutoOpenedMembersRef.current = true;
    navigation.setParams({
      openMembers: undefined,
      highlightMemberUserId: undefined,
    });
    void handleOpenMembers(highlightMemberUserId);
  }, [
    openMembersFlag,
    fetching,
    handleOpenMembers,
    highlightMemberUserId,
    navigation,
  ]);

  async function handleJoin() {
    if (!token) return;
    setJoinLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${community.id}/join`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const json = await res.json();
      if (res.ok) {
        const status: "pending" | "accepted" =
          json.membership?.status ?? json.status ?? "accepted";
        if (status === "accepted") {
          setCommunity((prev) => ({
            ...prev,
            user_role: json.membership?.role ?? "member",
            user_membership_status: "accepted",
            is_member: true,
            is_pending: false,
            members: (prev.members ?? 0) + 1,
          }));
        } else {
          setCommunity((prev) => ({
            ...prev,
            user_role: undefined,
            user_membership_status: "pending",
            is_member: false,
            is_pending: true,
          }));
        }
      }
    } catch {
      // silent — keep existing state
    } finally {
      setJoinLoading(false);
    }
  }

  async function handleCancelRequest() {
    if (!token) return;
    setCancelLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${community.id}/join-request`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      if (res.ok) {
        setCommunity((prev) => ({
          ...prev,
          user_role: undefined,
          user_membership_status: undefined,
          is_member: false,
          is_pending: false,
        }));
      }
    } catch {
      // silent — keep existing state
    } finally {
      setCancelLoading(false);
      setShowCancelModal(false);
    }
  }

  async function handleLeave() {
    if (!token) return;
    setLeaveLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${community.id}/leave`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      if (res.ok) {
        setCommunity((prev) => ({
          ...prev,
          user_role: undefined,
          user_membership_status: undefined,
          is_member: false,
          is_pending: false,
          members: Math.max(0, (prev.members ?? 1) - 1),
        }));
      }
    } catch {
      // silent — keep existing state
    } finally {
      setLeaveLoading(false);
      setShowLeaveModal(false);
    }
  }

  async function handleDeleteCommunity() {
    if (!token || !(await ensureCommunityAccess("owner"))) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${community.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );

      if (res.ok) {
        setShowDeleteModal(false);
        setDeleteLoading(false);
        const parentRouteNames =
          navigation.getParent()?.getState()?.routeNames ?? [];
        if (parentRouteNames.includes("CommunityList")) {
          navigation.reset({
            index: 0,
            routes: [{ name: "CommunityList" }],
          });
        } else {
          navigation.goBack();
        }
        return;
      }

      const data = await res.json().catch(() => null);
      Alert.alert(
        "Delete failed",
        data?.error || data?.message || "Could not delete this community.",
      );
    } catch {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {community.name}
        </Text>
        {token ? (
          <TouchableOpacity
            onPress={() => setShareSheetOpen(true)}
            style={styles.headerActionButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Share community"
          >
            <Send size={18} color={Colors.dark} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {fetching && <CommunityDetailSkeleton />}

      <ScrollView
        style={[styles.content, fetching && styles.hiddenContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {community.banner_url ? (
          <Image
            source={{ uri: community.banner_url }}
            style={styles.banner}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.banner, { backgroundColor: community.color }]}>
            <Text style={styles.bannerInitial}>
              {community.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.infoSection}>
          {/* Icon — half on banner, half on infoSection */}
          <View style={[styles.iconBox, { backgroundColor: community.color }]}>
            {community.icon ? (
              <Image
                source={{ uri: community.icon }}
                style={styles.iconImage}
              />
            ) : (
              <Text style={styles.iconInitial}>
                {community.name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>

          <Text style={styles.name}>{community.name}</Text>
          <Text style={styles.description}>{community.description}</Text>

          <View style={styles.metaRow}>
            {!!community.category && (
              <View style={styles.metaItem}>
                <Tag size={14} color="#888" strokeWidth={2} />
                <Text style={styles.metaText}>{community.category}</Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Users size={14} color="#888" strokeWidth={2} />
              <Text style={styles.metaText}>
                {(community.members ?? 0).toLocaleString()}{" "}
                {community.members === 1 ? "member" : "members"}
              </Text>
            </View>
            {community.is_public !== undefined && (
              <View style={styles.metaItem}>
                {community.is_public ? (
                  <Globe size={14} color="#888" strokeWidth={2} />
                ) : (
                  <Lock size={14} color="#888" strokeWidth={2} />
                )}
                <Text style={styles.metaText}>
                  {community.is_public ? "Public" : "Private"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.actionsScroll}
              style={styles.actionsContainer}
            >
              {isAdmin && (
                <Pressable
                  style={styles.actionButton}
                  onPress={() => void handleOpenEditCommunity()}
                >
                  <Pencil size={20} color={Colors.dark} strokeWidth={2} />
                  <Text style={styles.actionLabel}>Edit</Text>
                </Pressable>
              )}
              {canViewPrivateCommunityActions && (
                <Pressable
                  style={styles.actionButton}
                  onPress={() => void handleOpenEvents()}
                >
                  <CalendarDays size={20} color={Colors.dark} strokeWidth={2} />
                  <Text style={styles.actionLabel}>Events</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.actionButton}
                onPress={() =>
                  navigation.navigate("CommunityInfo", { community })
                }
              >
                <Info size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Details</Text>
              </Pressable>
              {isMember && (
                <Pressable
                  style={styles.actionButton}
                  onPress={() => void handleOpenMembers()}
                >
                  <Users size={20} color={Colors.dark} strokeWidth={2} />
                  <Text style={styles.actionLabel}>Members</Text>
                </Pressable>
              )}
              <Pressable style={styles.actionButton}>
                <Share size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Share</Text>
              </Pressable>
              {isOwner && (
                <Pressable
                  style={styles.actionButton}
                  onPress={async () => {
                    if (await ensureCommunityAccess("owner")) {
                      setShowDeleteModal(true);
                    }
                  }}
                >
                  <Trash2 size={20} color="#E53E3E" strokeWidth={2} />
                  <Text style={[styles.actionLabel, styles.destructiveLabel]}>
                    Delete
                  </Text>
                </Pressable>
              )}
              {isMember && !isOwner && (
                <Pressable
                  style={styles.actionButton}
                  onPress={() => setShowLeaveModal(true)}
                >
                  <LogOut size={20} color="#E53E3E" strokeWidth={2} />
                  <Text style={[styles.actionLabel, { color: "#E53E3E" }]}>
                    Leave
                  </Text>
                </Pressable>
              )}
            </ScrollView>
            {!isMember && !isPendingMember && (
              <Button
                label="Join Community"
                variant="default"
                fullWidth
                loading={joinLoading}
                onPress={() => void handleJoin()}
              />
            )}
            {isPendingMember && (
              <Button
                label="Request Sent · Tap to Cancel"
                variant="outline"
                fullWidth
                loading={cancelLoading}
                onPress={() => setShowCancelModal(true)}
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.sectionBody}>{community.description}</Text>
        </View>

        <View style={[styles.section, { marginBottom: 40 }]}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Text style={styles.emptyState}>
            No posts yet. Be the first to share something!
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showLeaveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLeaveModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowLeaveModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Leave Community?</Text>
            <Text style={styles.modalBody}>
              You'll lose access to{" "}
              <Text style={styles.modalCommunityName}>{community.name}</Text>.
              You can rejoin later, but you may need approval again if it's
              private.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowLeaveModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonSecondaryText}>Stay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDestructive]}
                onPress={() => void handleLeave()}
                activeOpacity={0.7}
                disabled={leaveLoading}
              >
                {leaveLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonDestructiveText}>Leave</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowCancelModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Cancel Request?</Text>
            <Text style={styles.modalBody}>
              Your request to join{" "}
              <Text style={styles.modalCommunityName}>{community.name}</Text>{" "}
              will be withdrawn. You can request to join again at any time.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowCancelModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonSecondaryText}>
                  Keep Request
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDestructive]}
                onPress={() => void handleCancelRequest()}
                activeOpacity={0.7}
                disabled={cancelLoading}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonDestructiveText}>
                    Cancel Request
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowDeleteModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Delete Community?</Text>
            <Text style={styles.modalBody}>
              This will permanently delete{" "}
              <Text style={styles.modalCommunityName}>{community.name}</Text>.
              This action can't be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowDeleteModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonSecondaryText}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDestructive]}
                onPress={() => void handleDeleteCommunity()}
                activeOpacity={0.7}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonDestructiveText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ShareToFriendsSheet
        visible={shareSheetOpen}
        attachment={
          shareSheetOpen ? { kind: "community", community } : null
        }
        token={token}
        navigation={navigation as unknown as NavigationProp<ParamListBase>}
        onClose={() => setShareSheetOpen(false)}
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginHorizontal: 12,
  },
  content: {
    flex: 1,
  },
  banner: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerInitial: {
    fontSize: 64,
    fontFamily: Fonts.gabarito.bold,
    color: "rgba(255,255,255,0.4)",
  },
  infoSection: {
    paddingTop: 28,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
  },
  iconBox: {
    position: "absolute",
    top: -ICON_SIZE + 16,
    left: 20,
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  iconImage: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 13,
  },
  iconInitial: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 30,
  },
  name: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 26,
    color: Colors.dark,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
  },
  memberCount: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
  },
  metaDot: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#ccc",
  },
  category: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
  },
  description: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  moreMembers: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
    color: "#888",
    marginLeft: 8,
  },
  actions: {
    marginTop: 20,
  },
  section: {
    marginTop: 12,
    padding: 20,
    backgroundColor: "#fff",
  },
  sectionTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 20,
    color: Colors.dark,
    marginBottom: 10,
  },
  sectionBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  emptyState: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  headerActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  hiddenContent: {
    display: "none",
  },
  skeletonContainer: {
    flex: 1,
  },
  skeletonBanner: {
    backgroundColor: "#E7E7E7",
  },
  skeletonIconBox: {
    position: "absolute",
    top: -ICON_SIZE + 16,
    left: 20,
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 16,
    overflow: "hidden",
    zIndex: 10,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "#E7E7E7",
  },
  skeletonDescription: {
    marginTop: 10,
    gap: 6,
  },
  skeletonMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
    marginBottom: 16,
  },
  skeletonActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    marginBottom: 20,
  },
  actionsContainer: {
    marginBottom: 16,
  },
  actionsScroll: {
    gap: 10,
  },
  actionButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
    width: 70,
    height: 70,
    backgroundColor: "#f9f9f9",
    gap: 4,
  },
  actionLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 10,
    color: Colors.dark,
  },
  destructiveLabel: {
    color: "#E53E3E",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.dark,
    textAlign: "center",
  },
  modalBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
  modalCommunityName: {
    fontFamily: Fonts.instrument.medium,
    color: Colors.dark,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonSecondary: {
    backgroundColor: "#F0F0F0",
  },
  modalButtonSecondaryText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  modalButtonDestructive: {
    backgroundColor: "#E53E3E",
  },
  modalButtonDestructiveText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: "#fff",
  },
});
