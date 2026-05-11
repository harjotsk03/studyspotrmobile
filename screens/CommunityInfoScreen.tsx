import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Globe, Lock } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { CommunityStackParamList } from "./CommunityDetailScreen";

type Props = NativeStackScreenProps<CommunityStackParamList, "CommunityInfo">;

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRole(value?: string | null) {
  if (!value) return "Visitor";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatNumber(value?: number | null) {
  return (value ?? 0).toLocaleString();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function CommunityInfoScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { community } = route.params;
  const isPrivate = community.is_public === false;
  const visibility = isPrivate ? "Private" : "Public";
  const role = formatRole(community.user_role ?? community.my_role);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={10}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {community.name}
          </Text>
          <Text style={styles.headerSubtitle}>Details</Text>
        </View>

        <View style={styles.backButtonPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>Community</Text>
        <Text style={styles.title}>{community.name}</Text>

        <View style={styles.metaLine}>
          <View style={styles.metaChip}>
            {isPrivate ? (
              <Lock size={13} color={Colors.dark} strokeWidth={2.2} />
            ) : (
              <Globe size={13} color={Colors.dark} strokeWidth={2.2} />
            )}
            <Text style={styles.metaChipText}>{visibility}</Text>
          </View>

          {!!community.category && (
            <>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>{community.category}</Text>
            </>
          )}
        </View>

        {!!community.description && (
          <Text style={styles.description}>{community.description}</Text>
        )}

        <View style={styles.divider} />

        <View style={styles.statRow}>
          <Stat label="Members" value={formatNumber(community.members)} />
          <View style={styles.statDivider} />
          <Stat label="Your role" value={role} />
          <View style={styles.statDivider} />
          <Stat label="Created" value={formatDate(community.created_at)} />
        </View>

        <View style={styles.divider} />
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
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    paddingHorizontal: 20,
  },
  backButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
    marginLeft: -8,
  },
  backButtonPlaceholder: {
    height: 36,
    width: 36,
  },
  headerCopy: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    textAlign: "center",
  },
  headerSubtitle: {
    color: "#9A9A9A",
    fontFamily: Fonts.instrument.medium,
    fontSize: 12,
    marginTop: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  eyebrow: {
    color: Colors.primary,
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 34,
    lineHeight: 38,
    marginTop: 8,
  },
  metaLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  metaChip: {
    alignItems: "center",
    borderColor: "#E2E2E2",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaChipText: {
    color: Colors.dark,
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 12,
  },
  metaDot: {
    backgroundColor: "#CFCFCF",
    borderRadius: 999,
    height: 3,
    width: 3,
  },
  metaText: {
    color: "#666",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
  },
  description: {
    color: "#3F3F3F",
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 22,
  },
  divider: {
    backgroundColor: "#E6E6E6",
    height: StyleSheet.hairlineWidth,
    marginVertical: 28,
  },
  statRow: {
    alignItems: "stretch",
    flexDirection: "row",
  },
  stat: {
    flex: 1,
    paddingHorizontal: 4,
  },
  statValue: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 18,
  },
  statLabel: {
    color: "#8A8A8A",
    fontFamily: Fonts.instrument.medium,
    fontSize: 12,
    letterSpacing: 0.4,
    marginTop: 6,
    textTransform: "uppercase",
  },
  statDivider: {
    backgroundColor: "#E6E6E6",
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
  },
});
