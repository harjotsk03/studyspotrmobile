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
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ArrowRightIcon,
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
import type { CommunityStackParamList } from "./CommunityDetailScreen";

// ─── Types ───────────────────────────────────────────────────────────────────

type ImageAsset = ImagePicker.ImagePickerAsset;

// ─── Constants ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3;

const STEP_SUBTITLES = [
  "Give your community a name and description",
  "Pick a category and set visibility",
  "Add an avatar and banner photo",
];

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

// ─── API helpers ─────────────────────────────────────────────────────────────

async function createCommunity(
  token: string,
  name: string,
  description: string,
  is_public: boolean,
  category: string,
) {
  const res = await fetch(`${API_BASE_URL}/api/v1/communities/create-community`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ name, description, is_public, category }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.community as { id: string };
}

async function getCommunityImageUploadUrls(
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
    avatar?: { uploadUrl: string; path: string; publicUrl: string };
    banner?: { uploadUrl: string; path: string; publicUrl: string };
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

async function confirmCommunityImages(
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
  return json.community;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CreateCommunityScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const { token } = useAuth();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 0
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const [descriptionError, setDescriptionError] = useState("");

  // Step 1
  const [category, setCategory] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [categoryError, setCategoryError] = useState("");

  // Step 2
  const [avatarAsset, setAvatarAsset] = useState<ImageAsset | null>(null);
  const [bannerAsset, setBannerAsset] = useState<ImageAsset | null>(null);

  // ── Validation ──────────────────────────────────────────────────────────

  const validateStep0 = (): boolean => {
    let valid = true;
    if (!name.trim()) {
      setNameError("Community name is required.");
      valid = false;
    } else if (name.trim().length < 3) {
      setNameError("Name must be at least 3 characters.");
      valid = false;
    } else {
      setNameError("");
    }
    if (!description.trim()) {
      setDescriptionError("Please add a short description.");
      valid = false;
    } else {
      setDescriptionError("");
    }
    return valid;
  };

  const validateStep1 = (): boolean => {
    if (!category) {
      setCategoryError("Please choose a category.");
      return false;
    }
    setCategoryError("");
    return true;
  };

  // ── Image picking ────────────────────────────────────────────────────────

  const pickImage = async (
    type: "avatar" | "banner",
    aspectRatio: [number, number],
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
      aspect: aspectRatio,
      quality: 0.85,
    });
    if (!result.canceled && result.assets.length > 0) {
      if (type === "avatar") setAvatarAsset(result.assets[0]);
      else setBannerAsset(result.assets[0]);
    }
  };

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!token) {
      Alert.alert("Error", "You must be logged in to create a community.");
      return;
    }
    setLoading(true);
    try {
      // 1) Create community
      const community = await createCommunity(
        token,
        name.trim(),
        description.trim(),
        isPublic,
        category,
      );

      // 2) Get signed upload URLs (only if images were selected)
      const urls = await getCommunityImageUploadUrls(
        token,
        community.id,
        avatarAsset,
        bannerAsset,
      );

      // 3) Upload images
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

      // 4) Confirm & link images
      await confirmCommunityImages(
        token,
        community.id,
        urls.avatar?.path,
        urls.banner?.path,
      );

      Alert.alert(
        "Community created!",
        `"${name.trim()}" is live. Go check it out.`,
        [{ text: "OK", onPress: () => navigation.navigate("CommunityList") }],
      );
    } catch (err) {
      Alert.alert(
        "Something went wrong",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      if (validateStep0()) setStep(1);
    } else if (step === 1) {
      if (validateStep1()) setStep(2);
    } else {
      await handleSubmit();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Create a Community</Text>
        <Text style={styles.subtitle}>{STEP_SUBTITLES[step]}</Text>

        {/* Progress bars */}
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressBar,
                i <= step ? styles.progressActive : styles.progressInactive,
              ]}
            />
          ))}
        </View>

        {/* ── Step 0: Name & Description ─────────────────────────────────── */}
        {step === 0 && (
          <>
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
              onChangeText={(t) => {
                setDescription(t);
                if (descriptionError) setDescriptionError("");
              }}
              autoCapitalize="sentences"
              multiline
              numberOfLines={4}
              icon={<FileTextIcon size={18} color="#999" />}
              error={descriptionError}
              containerStyle={styles.fieldGap}
              inputStyle={styles.textArea}
            />
          </>
        )}

        {/* ── Step 1: Category & Visibility ──────────────────────────────── */}
        {step === 1 && (
          <>
            <View style={styles.sectionHeader}>
              <TagIcon size={16} color="#666" />
              <Text style={styles.sectionLabel}>Category</Text>
            </View>
            <View style={styles.chipsGrid}>
              {CATEGORIES.map((cat) => {
                const selected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => {
                      setCategory(cat);
                      if (categoryError) setCategoryError("");
                    }}
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
            {!!categoryError && (
              <Text style={styles.errorText}>{categoryError}</Text>
            )}

            <View style={styles.toggleRow}>
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
          </>
        )}

        {/* ── Step 2: Avatar & Banner ─────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Text style={styles.optionalHint}>
              Both photos are optional — you can always add them later.
            </Text>

            {/* Avatar picker */}
            <View style={styles.sectionHeader}>
              <CameraIcon size={16} color="#666" />
              <Text style={styles.sectionLabel}>Community Avatar</Text>
            </View>
            <Pressable
              style={styles.avatarPickerContainer}
              onPress={() => pickImage("avatar", [1, 1])}
            >
              {avatarAsset ? (
                <Image
                  source={{ uri: avatarAsset.uri }}
                  style={styles.avatarPreview}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <CameraIcon size={28} color="#aaa" />
                  <Text style={styles.pickerHint}>Tap to choose avatar</Text>
                </View>
              )}
            </Pressable>

            {/* Banner picker */}
            <View style={[styles.sectionHeader, styles.fieldGap]}>
              <ImageIcon size={16} color="#666" />
              <Text style={styles.sectionLabel}>Banner Image</Text>
            </View>
            <Pressable
              style={styles.bannerPickerContainer}
              onPress={() => pickImage("banner", [16, 9])}
            >
              {bannerAsset ? (
                <Image
                  source={{ uri: bannerAsset.uri }}
                  style={styles.bannerPreview}
                />
              ) : (
                <View style={styles.bannerPlaceholder}>
                  <ImageIcon size={28} color="#aaa" />
                  <Text style={styles.pickerHint}>Tap to choose banner</Text>
                </View>
              )}
            </Pressable>
          </>
        )}

        {/* ── Navigation buttons ─────────────────────────────────────────── */}
        <View style={styles.buttonRow}>
          {step > 0 ? (
            <Button
              label="Back"
              variant="accent"
              onPress={() => setStep(step - 1)}
              style={styles.backButton}
            />
          ) : (
            <Button
              label="Cancel"
              variant="accent"
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            />
          )}
          <Button
            label={step === TOTAL_STEPS - 1 ? "Create Community" : "Next"}
            variant="default"
            loading={loading}
            icon={
              <ArrowRightIcon
                size={16}
                strokeWidth={3}
                color={Colors.light}
              />
            }
            iconPosition="right"
            onPress={handleNext}
            style={styles.nextButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 100,
    paddingBottom: 40,
  },
  title: {
    fontSize: 36,
    fontFamily: Fonts.gabarito.bold,
    color: Colors.dark,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: "#666",
    marginBottom: 20,
  },
  progressRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressActive: {
    backgroundColor: Colors.accent,
  },
  progressInactive: {
    backgroundColor: "#ddd",
  },
  fieldGap: {
    marginTop: 16,
  },
  textArea: {
    minHeight: 100,
    alignItems: "flex-start",
  },
  // Category chips
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
    backgroundColor: "#fff",
  },
  chipSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
  },
  chipText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#555",
  },
  chipTextSelected: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.medium,
  },
  errorText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#DC2626",
    marginTop: 6,
    marginLeft: 2,
  },
  // Toggle row
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 16,
    marginTop: 20,
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
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  // Image pickers
  optionalHint: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginBottom: 20,
    fontStyle: "italic",
  },
  avatarPickerContainer: {
    alignSelf: "center",
  },
  avatarPreview: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bannerPickerContainer: {
    borderRadius: 14,
    overflow: "hidden",
  },
  bannerPreview: {
    width: "100%",
    height: 140,
    borderRadius: 14,
  },
  bannerPlaceholder: {
    width: "100%",
    height: 140,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderStyle: "dashed",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pickerHint: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#aaa",
  },
  // Buttons
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
  },
  backButton: {
    flex: 1,
  },
  nextButton: {
    flex: 2,
  },
});
