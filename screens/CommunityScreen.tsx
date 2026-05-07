import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import type {
  CommunityData,
  CommunityLatestMember,
  CommunityStackParamList,
} from "./CommunityDetailScreen";
import { Check, ChevronDown, Search } from "lucide-react-native";

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

  useEffect(() => {
    void fetchCommunities();
  }, [token]);

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
        <View style={styles.ctaRow}>
          <View style={styles.ctaCopy}>
            <Text style={styles.title}>Create Your Own Community</Text>
            <Text style={styles.subtitle}>
              Host events, share posts, and meet new people.
            </Text>
          </View>
          <Button
            label="Create"
            variant="accent"
            size="sm"
            onPress={() => navigation.navigate("CreateCommunity")}
          />
        </View>

        <View style={styles.ctaRow}>
          <View style={styles.ctaCopy}>
            <Text style={styles.title}>Upcoming Events</Text>
            <Text style={styles.subtitle}>
              Find networking, studying, and career events.
            </Text>
          </View>
          <Button
            label="Browse"
            variant="default"
            size="sm"
            onPress={() => navigation.navigate("BrowseEvents")}
          />
        </View>

        <View style={styles.communitiesContainer}>
          <Text style={styles.sectionTitle}>Popular Communities Near You</Text>
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
              <Text style={styles.categorySelectorValue}>{categoryFilter}</Text>
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
  title: {
    fontSize: 18,
    fontFamily: Fonts.gabarito.medium,
    color: Colors.dark,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: Fonts.instrument.regular,
    color: Colors.dark,
    lineHeight: 16,
  },
  communitiesContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: Fonts.gabarito.semiBold,
    color: Colors.dark,
    marginBottom: 14,
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
