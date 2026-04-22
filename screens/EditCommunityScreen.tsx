import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CameraIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  LockIcon,
  TagIcon,
  TypeIcon,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import Input from "../components/Input";
import type {
  CommunityData,
  CommunityStackParamList,
} from "./CommunityDetailScreen";

// ─── Constants ───────────────────────────────────────────────────────────────

const ICON_SIZE = 72;

const CATEGORIES = [
  "Technology",
  "Study Groups",
  "Sports",
  "Arts & Culture",
  "Business",
  "Health",
  "Gaming",
  "Social",
  "Other",
];

type ImageAsset = ImagePicker.ImagePickerAsset;

type Props = NativeStackScreenProps<CommunityStackParamList, "EditCommunity">;

// ─── API helpers ─────────────────────────────────────────────────────────────

async function updateCommunity(
  token: string,
  communityId: string,
  name: string,
  description: string,
  is_public: boolean,
  category: string,
) {
  const res = await fetch(`${API_BASE_URL}/api/v1/communities/${communityId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ name, description, is_public, category }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.community as CommunityData;
}

async function getImageUploadUrls(
  token: string,
  communityId: string,
  avatarAsset: ImageAsset | null,
  bannerAsset: ImageAsset | null,
) {
  const body = {
    avatar: avatarAsset
      ? {
          filename: avatarAsset.fileName ?? "avatar.jpg",
          contentType: avatarAsset.mimeType ?? "image/jpeg",
        }
      : null,
    banner: bannerAsset
      ? {
          filename: bannerAsset.fileName ?? "banner.jpg",
          contentType: bannerAsset.mimeType ?? "image/jpeg",
        }
      : null,
  };
  const res = await fetch(
    `${API_BASE_URL}/api/v1/communities/${communityId}/image-upload-urls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as {
    avatar?: { uploadUrl: string; path: string };
    banner?: { uploadUrl: string; path: string };
  };
}

async function uploadToSignedUrl(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
) {
  const fileRes = await fetch(fileUri);
  const blob = await fileRes.blob();
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed: HTTP ${res.status} ${text}`);
  }
}

async function confirmImages(
  token: string,
  communityId: string,
  avatarPath?: string,
  bannerPath?: string,
) {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/communities/${communityId}/images`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ avatarPath, bannerPath }),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EditCommunityScreen({ route }: Props) {
  const { community } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);

  // Form state — pre-filled from existing community
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [category, setCategory] = useState(community.category ?? "");
  const [isPublic, setIsPublic] = useState(community.is_public ?? true);
  const [nameError, setNameError] = useState("");

  // New image picks (null = unchanged)
  const [avatarAsset, setAvatarAsset] = useState<ImageAsset | null>(null);
  const [bannerAsset, setBannerAsset] = useState<ImageAsset | null>(null);

  // ── Image picking ────────────────────────────────────────────────────────

  const pickImage = async (
    type: "avatar" | "banner",
    aspect: [number, number],
  ) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please allow photo library access to pick an image.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect,
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length > 0) {
      if (type === "avatar") setAvatarAsset(result.assets[0]);
      else setBannerAsset(result.assets[0]);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError("Community name is required.");
      return;
    }
    if (!token) return;

    setLoading(true);
    try {
      await updateCommunity(
        token,
        community.id,
        name.trim(),
        description.trim(),
        isPublic,
        category,
      );

      if (avatarAsset || bannerAsset) {
        const urls = await getImageUploadUrls(
          token,
          community.id,
          avatarAsset,
          bannerAsset,
        );
        if (urls.avatar?.uploadUrl && avatarAsset?.uri) {
          await uploadToSignedUrl(
            urls.avatar.uploadUrl,
            avatarAsset.uri,
            avatarAsset.mimeType ?? "image/jpeg",
          );
        }
        if (urls.banner?.uploadUrl && bannerAsset?.uri) {
          await uploadToSignedUrl(
            urls.banner.uploadUrl,
            bannerAsset.uri,
            bannerAsset.mimeType ?? "image/jpeg",
          );
        }
        await confirmImages(
          token,
          community.id,
          urls.avatar?.path,
          urls.banner?.path,
        );
      }

      Alert.alert("Saved!", "Your community has been updated.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Computed banner / avatar sources ─────────────────────────────────────

  const bannerUri = bannerAsset?.uri ?? community.banner_url ?? null;
  const avatarUri = avatarAsset?.uri ?? community.icon ?? null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Edit Community
        </Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Banner */}
          <Pressable
            onPress={() => pickImage("banner", [16, 9])}
            style={styles.bannerWrapper}
          >
            {bannerUri ? (
              <Image
                source={{ uri: bannerUri }}
                style={styles.banner}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[styles.banner, { backgroundColor: community.color }]}
              >
                <Text style={styles.bannerInitial}>
                  {community.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {/* Edit overlay */}
            <View style={styles.bannerOverlay}>
              <ImageIcon size={20} color="#fff" strokeWidth={2} />
              <Text style={styles.overlayLabel}>Change Banner</Text>
            </View>
          </Pressable>

          {/* Avatar — half overlapping banner */}
          <View style={styles.avatarAnchor}>
            <Pressable
              onPress={() => pickImage("avatar", [1, 1])}
              style={[styles.iconBox, { backgroundColor: community.color }]}
            >
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.iconImage}
                />
              ) : (
                <Text style={styles.iconInitial}>
                  {community.name.charAt(0).toUpperCase()}
                </Text>
              )}
              <View style={styles.iconOverlay}>
                <CameraIcon size={16} color="#fff" strokeWidth={2} />
              </View>
            </Pressable>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Community Name"
              placeholder="e.g. UBC Study Group"
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (nameError) setNameError("");
              }}
              autoCapitalize="words"
              icon={<TypeIcon size={18} color="#999" />}
              error={nameError}
            />

            <Input
              label="Description"
              placeholder="What is this community about?"
              value={description}
              onChangeText={setDescription}
              autoCapitalize="sentences"
              multiline
              numberOfLines={4}
              icon={<FileTextIcon size={18} color="#999" />}
              containerStyle={styles.fieldGap}
              inputStyle={styles.textArea}
            />

            {/* Category */}
            <View style={[styles.sectionHeader, styles.fieldGap]}>
              <TagIcon size={15} color="#666" />
              <Text style={styles.sectionLabel}>Category</Text>
            </View>
            <View style={styles.chipsGrid}>
              {CATEGORIES.map((cat) => {
                const selected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Public / Private toggle */}
            <View style={[styles.toggleRow, styles.fieldGap]}>
              <View style={styles.toggleLeft}>
                {isPublic ? (
                  <GlobeIcon size={20} color={Colors.primary} />
                ) : (
                  <LockIcon size={20} color="#666" />
                )}
                <View style={styles.toggleTextGroup}>
                  <Text style={styles.toggleTitle}>
                    {isPublic ? "Public" : "Private"}
                  </Text>
                  <Text style={styles.toggleDescription}>
                    {isPublic
                      ? "Anyone can find and join this community"
                      : "Only invited members can join"}
                  </Text>
                </View>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: "#ddd", true: Colors.accent }}
                thumbColor="#fff"
              />
            </View>

            <Button
              label="Save Changes"
              variant="default"
              loading={loading}
              onPress={handleSave}
              style={styles.saveButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  placeholder: {
    width: 40,
    height: 40,
  },
  // Banner
  bannerWrapper: {
    position: "relative",
    zIndex: 1,
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
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  overlayLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: "#fff",
  },
  // Avatar icon
  avatarAnchor: {
    backgroundColor: "#fff",
    zIndex: 10,
  },
  iconBox: {
    position: "absolute",
    top: -(ICON_SIZE / 2),
    left: 20,
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
    overflow: "hidden",
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
  iconOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Form
  form: {
    paddingTop: ICON_SIZE / 2 + 14,
    paddingHorizontal: 20,
    paddingBottom: 48,
    backgroundColor: "#fff",
  },
  fieldGap: {
    marginTop: 20,
  },
  textArea: {
    minHeight: 100,
    alignItems: "flex-start",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  sectionLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
  },
  chipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: Colors.light,
  },
  chipSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
  },
  chipText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: "#555",
  },
  chipTextSelected: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.medium,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 16,
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  toggleTextGroup: {
    flex: 1,
  },
  toggleTitle: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.dark,
  },
  toggleDescription: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  saveButton: {
    marginTop: 28,
  },
});
