import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { useAuth } from '../context/AuthContext';
import ProfileSectionButton from '../components/ProfileSectionButton';
import ProfileStat from '../components/ProfileStat';
import type { ProfileSectionKey, ProfileStackParamList } from './ProfileSectionScreen';
import { Share, UserPlus } from 'lucide-react-native';
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";
import type { RootStackParamList } from "../types/navigation";

export default function ProfileScreen() {
  const { profile, logout, refreshProfile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const user = profile?.userProfile;
  const profilePhotoUri =
    typeof user?.profile_photo === 'string' && user.profile_photo.trim()
      ? encodeURI(user.profile_photo.trim())
      : '';

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profilePhotoUri]);

  const initials = useMemo(() => getUserInitials(user ?? {}), [user]);
  const avatarColor = useMemo(() => getUserAvatarColor(user ?? {}), [user]);

  const stats = [
    { label: 'Spots Created', value: String(user?.spots_created_count ?? 0) },
    { label: 'Friends', value: String(user?.friends_count ?? 0) },
    { label: 'Communities', value: String(user?.communities_joined_count ?? 0) },
  ];
  const sectionButtons: Array<{
    key: ProfileSectionKey;
    title: string;
    subtitle: string;
  }> = [
    {
      key: 'personal',
      title: 'Personal Details',
      subtitle: 'First name, last name, email, and username',
    },
    {
      key: 'school',
      title: 'School',
      subtitle: 'School and field of study',
    },
    {
      key: 'location',
      title: 'Location',
      subtitle: 'City and country',
    },
    {
      key: 'settings',
      title: 'Settings',
      subtitle: 'Account actions and delete account',
    },
  ];

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
            progressViewOffset={48}
            title={refreshing ? "Refreshing profile..." : undefined}
            titleColor={Colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <Pressable style={styles.headerButton}>
            <UserPlus size={20} color={Colors.dark} />
          </Pressable>
          <Pressable style={styles.headerButton}>
            <Share size={20} color={Colors.dark} />
          </Pressable>
        </View>
        <View style={styles.heroCard}>
          <Pressable
            disabled={!user?.id}
            onPress={() =>
              user?.id
                ? rootNavigation.navigate("PublicProfile", { userId: user.id })
                : undefined
            }
          >
            {profilePhotoUri && !avatarLoadFailed ? (
              <Image
                key={profilePhotoUri}
                source={{ uri: profilePhotoUri }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <View
                style={[styles.avatarFallback, { backgroundColor: avatarColor }]}
              >
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.nameContainer}>
            <Text style={styles.name}>
              {user?.first_name || "First"} {user?.last_name || "Last"}
            </Text>
          </View>
          <Text style={user?.username ? styles.username : styles.noUsername}>
            {user?.username ? `@${user.username}` : "No username set"}
          </Text>
        </View>

        <View style={styles.bioContainer}>
          <View style={styles.statsContainer}>
            {stats.map((stat, index) => (
              <Fragment key={stat.label}>
                {index > 0 ? <View style={styles.statsDivider} /> : null}
                <ProfileStat label={stat.label} value={stat.value} />
              </Fragment>
            ))}
          </View>
          <Text style={styles.bio}>{user?.bio || "No bio set"}</Text>
        </View>

        <View style={styles.sectionsCard}>
          <Text style={styles.sectionTitle}>Manage Profile</Text>
          <View style={styles.sectionList}>
            {sectionButtons.map((item) => (
              <ProfileSectionButton
                key={item.key}
                title={item.title}
                subtitle={item.subtitle}
                onPress={() =>
                  navigation.navigate("ProfileSection", { section: item.key })
                }
              />
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  scroll: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heroCard: {
    alignItems: "center",
  },
  avatarImage: {
    width: 92,
    height: 92,
    borderRadius: 46,
    marginBottom: 16,
  },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarInitials: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 30,
    color: "#fff",
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  name: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 24,
    color: Colors.dark,
    textAlign: "center",
  },
  username: {
    marginTop: 4,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: Colors.primary,
  },
  noUsername: {
    marginTop: 4,
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: Colors.accent,
  },
  sectionsCard: {
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.dark,
    marginBottom: 12,
  },
  sectionList: {
    gap: 12,
  },
  logoutButton: {
    marginTop: 18,
    backgroundColor: Colors.dark,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  logoutText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: Fonts.gabarito.medium,
  },
  header: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerButton: {
    padding: 8,
  },
  bioContainer: {
    marginTop: 16,
    gap: 4,
    alignItems: "center",
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: "#e5e5e5",
  },
  bio: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
    marginTop: 8,
  },
});
