import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { API_BASE_URL } from "../constants/Api";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { SkeletonBox, SkeletonCard } from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";
import ProfileStat from "../components/ProfileStat";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import type { RootStackParamList } from "../types/navigation";

type PublicRelationship =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "friends"
  | "self";

type PublicUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  bio?: string | null;
  profile_photo?: string | null;
  school?: string | null;
  field_of_study?: string | null;
  city?: string | null;
  country?: string | null;
  friends_count?: number | null;
  spots_created_count?: number | null;
  communities_joined_count?: number | null;
};

type PublicProfileResponse = {
  user?: PublicUser;
  profile?: PublicUser;
  relationship?: PublicRelationship;
  error?: string;
};

type Props = NativeStackScreenProps<RootStackParamList, "PublicProfile">;

function getDisplayName(user?: PublicUser | null) {
  const fullName = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || user?.username || "StudySpotr user";
}

function getResponseMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

export default function PublicProfileScreen({ navigation, route }: Props) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { userId } = route.params;
  const [user, setUser] = useState<PublicUser | null>(null);
  const [relationship, setRelationship] =
    useState<PublicRelationship>("none");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const avatarUri =
    typeof user?.profile_photo === "string" && user.profile_photo.trim()
      ? encodeURI(user.profile_photo.trim())
      : "";
  const displayName = getDisplayName(user);
  const avatarUser = useMemo(
    () => ({
      id: user?.id,
      first_name: user?.first_name ?? undefined,
      last_name: user?.last_name ?? undefined,
      username: user?.username ?? undefined,
      name: displayName,
    }),
    [displayName, user],
  );
  const stats = [
    { label: "Spots", value: String(user?.spots_created_count ?? 0) },
    { label: "Friends", value: String(user?.friends_count ?? 0) },
    {
      label: "Communities",
      value: String(user?.communities_joined_count ?? 0),
    },
  ];

  async function fetchProfile(isRefresh = false) {
    if (!token) return;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/users/${userId}/public-profile`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const json = (await res
        .json()
        .catch(() => null)) as PublicProfileResponse | null;

      if (!res.ok) {
        throw new Error(getResponseMessage(json, `HTTP ${res.status}`));
      }

      const nextUser = json?.user ?? json?.profile ?? null;
      if (!nextUser) {
        throw new Error("Profile not found.");
      }

      setUser(nextUser);
      setRelationship(json?.relationship ?? "none");
      setAvatarLoadFailed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile.");
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    void fetchProfile();
  }, [token, userId]);

  async function sendProfileAction(nextRelationship: PublicRelationship) {
    if (!token) return;

    setActionLoading(true);
    const previousRelationship = relationship;
    setRelationship(nextRelationship);

    try {
      let res: Response;

      if (nextRelationship === "pending_sent") {
        res = await fetch(`${API_BASE_URL}/api/v1/users/send-friend-request`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ friend_id: userId }),
        });
      } else if (nextRelationship === "none") {
        res = await fetch(`${API_BASE_URL}/api/v1/users/friends/${userId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } else {
        res = await fetch(
          `${API_BASE_URL}/api/v1/users/friend-requests/respond`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ friend_id: userId, decision: "accept" }),
          },
        );
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getResponseMessage(json, "Could not update follow."));
      }

      void fetchProfile(true);
    } catch (err) {
      setRelationship(previousRelationship);
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not update follow.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  const primaryAction =
    relationship === "friends"
      ? { label: "Unfollow", next: "none" as const, muted: true }
      : relationship === "pending_sent"
        ? { label: "Requested", next: "none" as const, muted: true }
        : relationship === "pending_received"
          ? { label: "Accept", next: "friends" as const, muted: false }
          : relationship === "self"
            ? null
            : { label: "Follow", next: "pending_sent" as const, muted: false };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.scroll}>
          <View style={styles.heroCard}>
            <SkeletonBox width={96} height={96} radius={48} />
            <SkeletonBox width={170} height={24} radius={12} style={{ marginTop: 16 }} />
            <SkeletonBox width={110} height={14} radius={7} style={{ marginTop: 8 }} />
            <SkeletonBox width={128} height={41} radius={14} style={{ marginTop: 18 }} />
          </View>
          <View style={styles.statsContainer}>
            {[0, 1, 2].map((item) => (
              <View key={item} style={styles.statSkeleton}>
                <SkeletonBox width={42} height={20} radius={10} />
                <SkeletonBox width={70} height={12} radius={6} style={{ marginTop: 8 }} />
              </View>
            ))}
          </View>
          <SkeletonBox width="88%" height={15} radius={8} style={{ alignSelf: "center", marginTop: 24 }} />
          <SkeletonCard style={styles.infoCard}>
            <SkeletonBox width="65%" height={14} radius={7} />
            <SkeletonBox width="56%" height={14} radius={7} />
            <SkeletonBox width="72%" height={14} radius={7} />
          </SkeletonCard>
        </View>
      )}

      {!loading && !!error && (
        <View style={styles.stateCard}>
          <Text style={styles.emptyTitle}>Could not load profile</Text>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      )}

      {!loading && !error && user && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void fetchProfile(true)}
              tintColor={Colors.primary}
            />
          }
        >
          <View style={styles.heroCard}>
            {avatarUri && !avatarLoadFailed ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <View
                style={[
                  styles.avatarFallback,
                  { backgroundColor: getUserAvatarColor(avatarUser) },
                ]}
              >
                <Text style={styles.avatarInitials}>
                  {getUserInitials(avatarUser)}
                </Text>
              </View>
            )}

            <Text style={styles.name}>{displayName}</Text>
            {!!user.username && (
              <Text style={styles.username}>@{user.username}</Text>
            )}

            {!!primaryAction && (
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={actionLoading}
                onPress={() => void sendProfileAction(primaryAction.next)}
                style={[
                  styles.followButton,
                  primaryAction.muted && styles.followButtonMuted,
                  actionLoading && styles.disabledButton,
                ]}
              >
                <Text
                  style={[
                    styles.followButtonText,
                    primaryAction.muted && styles.followButtonMutedText,
                  ]}
                >
                  {primaryAction.label}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.statsContainer}>
            {stats.map((stat) => (
              <ProfileStat
                key={stat.label}
                label={stat.label}
                value={stat.value}
              />
            ))}
          </View>

          {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          <View style={styles.infoCard}>
            {!!user.school && (
              <Text style={styles.infoText}>School: {user.school}</Text>
            )}
            {!!user.field_of_study && (
              <Text style={styles.infoText}>
                Field: {user.field_of_study}
              </Text>
            )}
            {!!(user.city || user.country) && (
              <Text style={styles.infoText}>
                Location: {[user.city, user.country].filter(Boolean).join(", ")}
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  loader: {
    marginTop: 28,
  },
  stateCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 20,
  },
  emptyTitle: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    marginBottom: 6,
  },
  emptyText: {
    color: "#666",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroCard: {
    alignItems: "center",
    paddingTop: 8,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 16,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarInitials: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 31,
  },
  name: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 25,
    textAlign: "center",
  },
  username: {
    color: Colors.primary,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    marginTop: 4,
  },
  followButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    marginTop: 18,
    minWidth: 128,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  followButtonMuted: {
    backgroundColor: "#fff",
  },
  disabledButton: {
    opacity: 0.6,
  },
  followButtonText: {
    color: "#fff",
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 15,
    textAlign: "center",
  },
  followButtonMutedText: {
    color: Colors.dark,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 24,
  },
  statSkeleton: {
    alignItems: "center",
  },
  bio: {
    color: "#555",
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 22,
    textAlign: "center",
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    gap: 8,
    marginTop: 22,
    padding: 18,
  },
  infoText: {
    color: "#555",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
  },
});
