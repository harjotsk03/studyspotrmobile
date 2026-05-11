import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  ArrowLeft,
  CalendarDays,
  Globe,
  Info,
  Lock,
  LogOut,
  Pencil,
  Share,
  Tag,
  Trash2,
  Users,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
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
  };
  BrowseEvents: undefined;
  CreateEvent: {
    communityId: string;
    communityName: string;
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
  const [joinLoading, setJoinLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchCommunity() {
      if (!token) {
        setFetching(false);
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/communities/${initialCommunity.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = await res.json();
        if (res.ok && !cancelled) {
          const raw = json.community ?? json;
          setCommunity((prev) => ({
            ...prev,
            ...raw,
            // Map API fields → internal shape
            user_role: raw.is_member ? (raw.my_role ?? "member") : undefined,
            user_membership_status:
              raw.membership_status ?? raw.user_membership_status,
            // Preserve member count if the API doesn't return one
            members: raw.members ?? raw.member_count ?? prev.members,
          }));
        }
      } catch {
        // keep the navigation-param snapshot on network error
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    void fetchCommunity();
    return () => {
      cancelled = true;
    };
  }, [initialCommunity.id, token]);

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
    navigation.navigate("CommunityMembers", {
      communityId: community.id,
      communityName: community.name,
      isAdmin,
      highlightUserId: highlightMemberUserId,
    });
  }, [
    openMembersFlag,
    fetching,
    isAdmin,
    community.id,
    community.name,
    highlightMemberUserId,
    navigation,
  ]);

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
    if (!token || !isOwner) return;
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
        navigation.reset({
          index: 0,
          routes: [{ name: "CommunityList" }],
        });
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
        <View style={styles.placeholder} />
      </View>

      {fetching && (
        <SkeletonBox
          width="40%"
          height={8}
          radius={4}
          style={styles.fetchingIndicator}
        />
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
                  onPress={() =>
                    navigation.navigate("EditCommunity", { community })
                  }
                >
                  <Pencil size={20} color={Colors.dark} strokeWidth={2} />
                  <Text style={styles.actionLabel}>Edit</Text>
                </Pressable>
              )}
              {canViewPrivateCommunityActions && (
                <Pressable
                  style={styles.actionButton}
                  onPress={() =>
                    navigation.navigate("CommunityEvents", {
                      communityId: community.id,
                      communityName: community.name,
                      isAdmin,
                      communityIsPublic: community.is_public ?? true,
                      userCommunityRole: community.user_role,
                    })
                  }
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
              {canViewPrivateCommunityActions && (
                <Pressable
                  style={styles.actionButton}
                  onPress={() =>
                    navigation.navigate("CommunityMembers", {
                      communityId: community.id,
                      communityName: community.name,
                      isAdmin,
                    })
                  }
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
                  onPress={() => setShowDeleteModal(true)}
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
  fetchingIndicator: {
    position: "absolute",
    top: 0,
    right: 16,
    zIndex: 10,
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
