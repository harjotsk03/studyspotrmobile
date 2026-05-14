import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import ProfileSectionButton from "../components/ProfileSectionButton";
import ProfileStat from "../components/ProfileStat";
import type {
  ProfileSectionKey,
  ProfileStackParamList,
} from "./ProfileSectionScreen";
import { Camera, Share, UserPlus } from "lucide-react-native";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

export default function ProfileScreen() {
  const { profile, logout, refreshProfile, uploadProfilePhoto } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const user = profile?.userProfile;
  const profilePhotoUri =
    typeof user?.profile_photo === "string" && user.profile_photo.trim()
      ? encodeURI(user.profile_photo.trim())
      : "";

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profilePhotoUri]);

  const initials = useMemo(() => getUserInitials(user ?? {}), [user]);
  const avatarColor = useMemo(() => getUserAvatarColor(user ?? {}), [user]);

  const stats = [
    { label: "Spots Created", value: String(user?.spots_created_count ?? 0) },
    { label: "Friends", value: String(user?.friends_count ?? 0) },
    {
      label: "Communities",
      value: String(user?.communities_joined_count ?? 0),
    },
  ];
  const sectionButtons: Array<{
    key: ProfileSectionKey;
    title: string;
    subtitle: string;
  }> = [
    {
      key: "personal",
      title: "Personal Details",
      subtitle: "First name, last name, username, and bio",
    },
    {
      key: "school",
      title: "School",
      subtitle: "School and field of study",
    },
    {
      key: "location",
      title: "Location",
      subtitle: "City and country",
    },
    {
      key: "settings",
      title: "Settings",
      subtitle: "Account actions and delete account",
    },
  ];

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: logout },
    ]);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const captureImageUri = useCallback(
    async (
      source: "library" | "camera",
    ): Promise<ImagePicker.ImagePickerAsset | null> => {
    const options = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.85,
    };

    if (source === "library") {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo library access so you can choose a profile picture.",
        );
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return null;
      return result.assets[0];
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow camera access to take your profile photo.",
      );
      return null;
    }

    const result = await ImagePicker.launchCameraAsync(options);
    if (result.canceled || !result.assets?.[0]) return null;
    return result.assets[0];
  }, []);

  const handleChangePhoto = useCallback(() => {
    const confirmAndUpload = async (src: "library" | "camera") => {
      try {
        setPhotoBusy(true);
        const asset = await captureImageUri(src);
        if (!asset?.uri) return;
        await uploadProfilePhoto(asset.uri, {
          contentType: asset.mimeType ?? undefined,
          fileName: asset.fileName ?? undefined,
        });
        setAvatarLoadFailed(false);
        Alert.alert("Photo updated", "Your profile photo was saved.");
      } catch (err) {
        Alert.alert(
          "Error",
          err instanceof Error
            ? err.message
            : "Could not update your photo. Please try again.",
        );
      } finally {
        setPhotoBusy(false);
      }
    };

    Alert.alert("Profile photo", "How would you like to update your picture?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Choose from library",
        onPress: () => void confirmAndUpload("library"),
      },
      {
        text: "Take photo",
        onPress: () => void confirmAndUpload("camera"),
      },
    ]);
  }, [captureImageUri, uploadProfilePhoto]);

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
          <View style={styles.avatarBlock}>
            <Pressable
              accessibilityLabel="Change profile photo"
              accessibilityRole="button"
              disabled={photoBusy}
              onPress={handleChangePhoto}
              style={[styles.avatarPressable, photoBusy && styles.disabledTap]}
            >
              {photoBusy ? (
                <View style={[styles.avatarFallback, styles.avatarLoading]}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                </View>
              ) : profilePhotoUri && !avatarLoadFailed ? (
                <Image
                  key={profilePhotoUri}
                  source={{ uri: profilePhotoUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <View
                  style={[
                    styles.avatarFallback,
                    { backgroundColor: avatarColor },
                  ]}
                >
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              accessibilityLabel="Change profile photo"
              accessibilityRole="button"
              importantForAccessibility="no"
              style={[
                styles.avatarEditButton,
                photoBusy && styles.avatarEditDisabled,
              ]}
              disabled={photoBusy}
              hitSlop={8}
              onPress={handleChangePhoto}
            >
              <Camera size={16} color="#fff" strokeWidth={2.2} />
            </Pressable>
          </View>

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
  avatarBlock: {
    position: "relative",
    width: 92,
    height: 92,
    marginBottom: 16,
  },
  avatarPressable: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: "hidden",
  },
  disabledTap: {
    opacity: 0.7,
  },
  avatarLoading: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditButton: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarEditDisabled: {
    opacity: 0.55,
  },
  avatarImage: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
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
