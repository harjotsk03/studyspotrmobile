import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import TopNav from "../components/TopNav";
import type {
  CommunityData,
  CommunityStackParamList,
} from "./CommunityDetailScreen";

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
  avatar_url?: string;
  profile_photo?: string;
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

function toMemberAvatars(latest_members?: (ApiMember | string)[]): string[] {
  if (!latest_members) return [];
  return latest_members
    .map((m) =>
      typeof m === "string" ? m : (m.avatar_url ?? m.profile_photo ?? ""),
    )
    .filter(Boolean) as string[];
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
    memberAvatars: toMemberAvatars(api.latest_members),
  };
}

export default function CommunityScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const { token } = useAuth();

  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchCommunities = async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities?limit=20&offset=0`,
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

  useEffect(() => {
    void fetchCommunities();
  }, [token]);

  return (
    <View style={styles.container}>
      <TopNav />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchCommunities(true)}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <Image
          source={require("../assets/communityheader.png")}
          style={styles.headerImage}
          resizeMode="cover"
        />
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Create Your Own Community</Text>
          <Text style={styles.subtitle}>
            Host events, share posts, meet new people and connect!
          </Text>
          <Button
            label="Create a Community"
            variant="accent"
            onPress={() => navigation.navigate("CreateCommunity")}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>Upcoming Events</Text>
          <Text style={styles.subtitle}>
            Find networking, studying, or career progression events near you and
            find a community to help push you forward.
          </Text>
          <Button label="Browse Events" variant="default" onPress={() => {}} />
        </View>

        <View style={styles.communitiesContainer}>
          <Text style={styles.sectionTitle}>Popular Communities Near You</Text>

          {loading && (
            <ActivityIndicator
              size="large"
              color={Colors.primary}
              style={styles.loader}
            />
          )}

          {!loading && !!error && <Text style={styles.errorText}>{error}</Text>}

          {!loading && !error && communities.length === 0 && (
            <Text style={styles.emptyText}>No communities found.</Text>
          )}

          {communities.map((community) => (
            <CommunityCard
              key={community.id}
              name={community.name}
              members={community.members}
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
    paddingTop: 0,
  },
  titleContainer: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
  },
  headerImage: {
    width: "100%",
    height: 124,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.gabarito.medium,
    color: Colors.dark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.instrument.regular,
    color: Colors.dark,
    marginBottom: 20,
  },
  communitiesContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: Fonts.gabarito.semiBold,
    color: Colors.dark,
    marginBottom: 14,
  },
  loader: {
    marginTop: 32,
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
});
