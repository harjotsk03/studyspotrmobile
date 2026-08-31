import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../types/navigation";
import type {
  ProfileSectionKey,
  ProfileStackParamList,
} from "./ProfileSectionScreen";

type SettingsRow = {
  key: string;
  title: string;
  subtitle: string;
  destructive?: boolean;
  onPress: () => void;
};

function ListRow({
  title,
  subtitle,
  destructive,
  last,
  onPress,
}: {
  title: string;
  subtitle: string;
  destructive?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      style={[styles.row, !last && styles.rowDivider]}
    >
      <Text style={[styles.rowTitle, destructive && styles.rowTitleDestructive]}>
        {title}
      </Text>
      <Text style={styles.rowSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

export default function ProfileSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout },
    ]);
  };

  const goSection = (section: ProfileSectionKey) => {
    navigation.navigate("ProfileSection", { section });
  };

  const rows: SettingsRow[] = [
    {
      key: "personal",
      title: "Personal details",
      subtitle: "First name, last name, username, and bio",
      onPress: () => goSection("personal"),
    },
    {
      key: "school",
      title: "School",
      subtitle: "School and field of study",
      onPress: () => goSection("school"),
    },
    {
      key: "location",
      title: "Location",
      subtitle: "City and country",
      onPress: () => goSection("location"),
    },
    {
      key: "blocked",
      title: "Blocked users",
      subtitle: "Manage people you've blocked",
      onPress: () => rootNavigation.navigate("BlockedUsers"),
    },
    {
      key: "delete",
      title: "Delete account",
      subtitle: "Permanently remove your StudySpotr account",
      destructive: true,
      onPress: () => goSection("settings"),
    },
    {
      key: "logout",
      title: "Log out",
      subtitle: "Sign out of this device",
      destructive: true,
      onPress: handleLogout,
    },
  ];

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
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Settings</Text>
        </View>
        <View style={[styles.iconButton, styles.hiddenIconButton]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        {rows.map((row, index) => (
          <ListRow
            key={row.key}
            title={row.title}
            subtitle={row.subtitle}
            destructive={row.destructive}
            last={index === rows.length - 1}
            onPress={row.onPress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  hiddenIconButton: {
    backgroundColor: Colors.light,
  },
  headerCopy: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 12,
  },
  title: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.bold,
    fontSize: 21,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 4,
  },
  row: {
    paddingVertical: 16,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E2E2",
  },
  rowTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  rowTitleDestructive: {
    color: "#DC3545",
  },
  rowSubtitle: {
    marginTop: 4,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
    color: "#8A8F96",
  },
});
