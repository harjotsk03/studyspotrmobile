import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  Pencil,
  Share,
  Tag,
  Users,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";

export interface CommunityData {
  id: string;
  name: string;
  members: number;
  description: string;
  icon?: string;
  banner_url?: string;
  color: string;
  category?: string;
  is_public?: boolean;
  user_role?: string;
  memberAvatars: string[];
}

export type CommunityStackParamList = {
  CommunityList: undefined;
  CommunityDetail: { community: CommunityData };
  CreateCommunity: undefined;
  EditCommunity: { community: CommunityData };
  CommunityEvents: {
    communityId: string;
    communityName: string;
    isAdmin: boolean;
  };
  CreateEvent: {
    communityId: string;
    communityName: string;
  };
};

type Props = NativeStackScreenProps<CommunityStackParamList, "CommunityDetail">;

const ICON_SIZE = 72;

export default function CommunityDetailScreen({ route }: Props) {
  const { community: initialCommunity } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [community, setCommunity] = useState<CommunityData>(initialCommunity);
  const [fetching, setFetching] = useState(true);

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
        if (res.ok && !cancelled) setCommunity(json.community ?? json);
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

  const isAdmin =
    community.user_role === "owner" || community.user_role === "admin";

  const isOwner = community.user_role === "owner";

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
        <ActivityIndicator
          size="small"
          color={Colors.primary}
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
                {community.members.toLocaleString()}{" "}
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
              <Pressable
                style={styles.actionButton}
                onPress={() =>
                  navigation.navigate("CommunityEvents", {
                    communityId: community.id,
                    communityName: community.name,
                    isAdmin,
                  })
                }
              >
                <CalendarDays size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Events</Text>
              </Pressable>
              <Pressable style={styles.actionButton}>
                <Info size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Details</Text>
              </Pressable>
              <Pressable style={styles.actionButton}>
                <Users size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Members</Text>
              </Pressable>
              <Pressable style={styles.actionButton}>
                <Share size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Share</Text>
              </Pressable>
            </ScrollView>
            {!isOwner && (
              <Button label="Join Community" variant="default" fullWidth />
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
});
