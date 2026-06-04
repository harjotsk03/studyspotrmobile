import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CameraIcon,
  CheckCircle2,
  FileTextIcon,
  GlobeIcon,
  GraduationCapIcon,
  ImageIcon,
  LockIcon,
  Plus,
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

// ─── Types ───────────────────────────────────────────────────────────────────

type ImageAsset = ImagePicker.ImagePickerAsset;

type CreatedCommunity = {
  id: string;
  name?: string;
  description?: string;
  members?: number;
  member_count?: number;
  icon?: string;
  avatar_url?: string;
  banner_url?: string;
  color?: string;
  category?: string;
  is_public?: boolean;
  user_role?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3;

const STEP_SUBTITLES = [
  "Give your community a name and description",
  "Choose a type, category, and visibility",
  "Add an optional community photo and banner",
];

type CommunityType = "student_community" | "study_group";

const COMMUNITY_TYPES: {
  value: CommunityType;
  label: string;
  description: string;
  Icon: typeof GraduationCapIcon;
}[] = [
  {
    value: "student_community",
    label: "Student Community",
    description: "A general community for students to connect.",
    Icon: GraduationCapIcon,
  },
  {
    value: "study_group",
    label: "Study Group",
    description: "Focused on studying a subject or course together.",
    Icon: BookOpenIcon,
  },
];

const CATEGORIES = [
  "Technology",
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
  community_type: CommunityType,
) {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/communities/create-community`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        is_public,
        category,
        community_type,
      }),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.community as CreatedCommunity;
}

async function getCommunityImageUploadUrls(
  token: string,
  communityId: string,
  avatarAsset: ImageAsset | null,
  bannerAsset: ImageAsset | null,
) {
  const body: {
    avatar?: { filename: string; contentType: string };
    banner?: { filename: string; contentType: string };
  } = {};

  if (avatarAsset) {
    body.avatar = {
      filename: avatarAsset.fileName ?? "avatar.jpg",
      contentType: avatarAsset.mimeType ?? "image/jpeg",
    };
  }

  if (bannerAsset) {
    body.banner = {
      filename: bannerAsset.fileName ?? "banner.jpg",
      contentType: bannerAsset.mimeType ?? "image/jpeg",
    };
  }

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
  return json.community as CreatedCommunity | undefined;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CreateCommunityScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const submitInFlightRef = useRef(false);

  // Step 0
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const [descriptionError, setDescriptionError] = useState("");

  // Step 1
  const [communityType, setCommunityType] = useState<CommunityType | "">("");
  const [communityTypeError, setCommunityTypeError] = useState("");
  // Multi-select: each tap toggles a category in/out of `categories`. The
  // built-in set comes from CATEGORIES; user-added customs live in
  // `customCategories` so they persist as visible options for this
  // session even when toggled off.
  const [categories, setCategories] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  // Drives the "Other" input/+ row's slide-fade animation. 0 = hidden,
  // 1 = visible. Height is JS-driven (useNativeDriver: false), and
  // opacity/translateY ride the same value so everything stays in lockstep.
  const otherInputAnim = useRef(new Animated.Value(0)).current;
  const isOtherSelected = categories.includes("Other");
  useEffect(() => {
    Animated.timing(otherInputAnim, {
      toValue: isOtherSelected ? 1 : 0,
      duration: 240,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [isOtherSelected, otherInputAnim]);

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
    if (categoryError) setCategoryError("");
  };

  const addCustomCategory = () => {
    const trimmed = customCategoryInput.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    // Don't add duplicates of either a built-in or an existing custom —
    // case-insensitive so "Music" and "music" collapse to the same pill.
    const duplicate =
      CATEGORIES.some((c) => c.toLowerCase() === lower) ||
      customCategories.some((c) => c.toLowerCase() === lower);
    if (duplicate) {
      setCustomCategoryInput("");
      return;
    }
    setCustomCategories((prev) => [...prev, trimmed]);
    setCategories((prev) => [...prev, trimmed]);
    setCustomCategoryInput("");
    if (categoryError) setCategoryError("");
  };

  // Step 2
  const [avatarAsset, setAvatarAsset] = useState<ImageAsset | null>(null);
  const [bannerAsset, setBannerAsset] = useState<ImageAsset | null>(null);

  // Success modal
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [createdCommunity, setCreatedCommunity] =
    useState<CreatedCommunity | null>(null);

  const buildCreatedCommunityData = (
    community: CreatedCommunity,
  ): CommunityData => ({
    id: community.id,
    name: community.name ?? name.trim(),
    description: community.description ?? description.trim(),
    members: community.members ?? community.member_count ?? 1,
    icon: community.icon ?? community.avatar_url,
    banner_url: community.banner_url,
    color: community.color ?? Colors.accent,
    category: community.category ?? categories.join(", "),
    is_public: community.is_public ?? isPublic,
    user_role: community.user_role ?? "owner",
    memberAvatars: [],
  });

  const resetToCreatedCommunity = (community: CreatedCommunity) => {
    navigation.reset({
      index: 1,
      routes: [
        { name: "CommunityList" },
        {
          name: "CommunityDetail",
          params: { community: buildCreatedCommunityData(community) },
        },
      ],
    });
  };

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
    let valid = true;
    if (!communityType) {
      setCommunityTypeError("Please choose a community type.");
      valid = false;
    } else {
      setCommunityTypeError("");
    }
    if (categories.length === 0) {
      setCategoryError("Please choose at least one category.");
      valid = false;
    } else {
      setCategoryError("");
    }
    return valid;
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
    if (loading || submitInFlightRef.current) return;
    if (!token) {
      Alert.alert("Error", "You must be logged in to create a community.");
      return;
    }
    if (!communityType) {
      Alert.alert("Error", "Please choose a community type.");
      return;
    }
    submitInFlightRef.current = true;
    setLoading(true);
    try {
      let community = await createCommunity(
        token,
        name.trim(),
        description.trim(),
        isPublic,
        // The backend API still accepts a single `category` string; join
        // multi-selected entries with ", " so the existing payload shape
        // stays unchanged for the server.
        categories.join(", "),
        communityType,
      );

      if (avatarAsset || bannerAsset) {
        try {
          const urls = await getCommunityImageUploadUrls(
            token,
            community.id,
            avatarAsset,
            bannerAsset,
          );

          if (avatarAsset?.uri && !urls.avatar?.uploadUrl) {
            throw new Error("Could not prepare avatar upload.");
          }
          if (bannerAsset?.uri && !urls.banner?.uploadUrl) {
            throw new Error("Could not prepare banner upload.");
          }

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

          if (urls.avatar?.path || urls.banner?.path) {
            const updatedCommunity = await confirmCommunityImages(
              token,
              community.id,
              urls.avatar?.path,
              urls.banner?.path,
            );
            if (updatedCommunity) {
              community = { ...community, ...updatedCommunity };
            }
          }
        } catch {
          Alert.alert(
            "Community created",
            "Your community was created, but the images could not be uploaded. You can add them later.",
            [
              {
                text: "OK",
                onPress: () => resetToCreatedCommunity(community),
              },
            ],
          );
          return;
        }
      }

      setCreatedCommunity(community);
      setSuccessModalVisible(true);
    } catch (err) {
      Alert.alert(
        "Something went wrong",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      submitInFlightRef.current = false;
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

  const handleHeaderBack = () => {
    if (loading) return;
    if (step > 0) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSuccessGo = () => {
    if (!createdCommunity) return;
    setSuccessModalVisible(false);
    resetToCreatedCommunity(createdCommunity);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        {step === 0 ? (
          // Step 1 of the wizard — the back arrow exits the entire flow,
          // so we keep the discreet circular icon to avoid front-loading
          // a "Back" affordance that's actually a "Cancel".
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={handleHeaderBack}
            disabled={loading}
            style={({ pressed }) => [
              styles.backIconButton,
              pressed && styles.backIconButtonPressed,
            ]}
            hitSlop={10}
          >
            <ArrowLeftIcon size={22} color={Colors.dark} strokeWidth={2.2} />
          </Pressable>
        ) : (
          // Steps 2 & 3 — back goes to the previous step within the
          // wizard, so we surface it as a labeled accent pill so users
          // notice they CAN walk backwards without losing progress.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to previous step"
            onPress={handleHeaderBack}
            disabled={loading}
            style={({ pressed }) => [
              styles.backPillButton,
              pressed && styles.backIconButtonPressed,
            ]}
            hitSlop={10}
          >
            <ArrowLeftIcon size={20} color={Colors.accent} strokeWidth={2.4} />
            <Text style={styles.backPillLabel}>Back</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 64 }]}
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
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (nameError) setNameError("");
              }}
              autoCapitalize="words"
              placeholder="e.g. UBC Computer Science"
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

        {/* ── Step 1: Type, Category & Visibility ────────────────────────── */}
        {step === 1 && (
          <>
            <View style={styles.sectionHeader}>
              <GraduationCapIcon size={16} color="#666" />
              <Text style={styles.sectionLabel}>Community Type</Text>
            </View>
            <View style={styles.typeStack}>
              {COMMUNITY_TYPES.map(({ value, label, description, Icon }) => {
                const selected = communityType === value;
                return (
                  <Pressable
                    key={value}
                    style={[
                      styles.typeCard,
                      selected && styles.typeCardSelected,
                    ]}
                    onPress={() => {
                      setCommunityType(value);
                      if (communityTypeError) setCommunityTypeError("");
                    }}
                  >
                    <View
                      style={[
                        styles.typeIconWrap,
                        selected && styles.typeIconWrapSelected,
                      ]}
                    >
                      <Icon
                        size={20}
                        color={selected ? Colors.accent : "#666"}
                        strokeWidth={2.2}
                      />
                    </View>
                    <View style={styles.typeTextGroup}>
                      <Text
                        style={[
                          styles.typeLabel,
                          selected && styles.typeLabelSelected,
                        ]}
                      >
                        {label}
                      </Text>
                      <Text style={styles.typeDescription}>{description}</Text>
                    </View>
                    <View
                      style={[
                        styles.typeRadio,
                        selected && styles.typeRadioSelected,
                      ]}
                    >
                      {selected && <View style={styles.typeRadioInner} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {!!communityTypeError && (
              <Text style={styles.errorText}>{communityTypeError}</Text>
            )}

            <View style={[styles.sectionHeader, styles.fieldGap]}>
              <TagIcon size={16} color="#666" />
              <Text style={styles.sectionLabel}>Category</Text>
            </View>
            <View style={styles.chipsGrid}>
              {/* Built-in chips first (everything except "Other"), then
                  user-added customs, then "Other" last — so when the user
                  hits + on the custom input the new pill slides in
                  *immediately before* the Other chip. */}
              {CATEGORIES.filter((c) => c !== "Other").map((cat) => {
                const selected = categories.includes(cat);
                return (
                  <Pressable
                    key={cat}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => toggleCategory(cat)}
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
              {customCategories.map((cat) => {
                const selected = categories.includes(cat);
                return (
                  <Pressable
                    key={`custom:${cat}`}
                    style={[
                      styles.chip,
                      selected && styles.chipSelected,
                      // Faded look while turned off — communicates
                      // "you added this and toggled it off" while keeping
                      // it visible (and tappable to re-enable) for this
                      // session, per the spec.
                      !selected && styles.chipCustomDisabled,
                    ]}
                    onPress={() => toggleCategory(cat)}
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
              <Pressable
                key="Other"
                style={[
                  styles.chip,
                  isOtherSelected && styles.chipSelected,
                ]}
                onPress={() => toggleCategory("Other")}
              >
                <Text
                  style={[
                    styles.chipText,
                    isOtherSelected && styles.chipTextSelected,
                  ]}
                >
                  Other
                </Text>
              </Pressable>
            </View>

            {/* Slide + fade-in row for typing a custom category. Height
                is animated so the layout doesn't reserve space when
                hidden, and pointerEvents is gated so the input can't be
                focused-into while collapsed. */}
            <Animated.View
              pointerEvents={isOtherSelected ? "auto" : "none"}
              style={{
                opacity: otherInputAnim,
                transform: [
                  {
                    translateY: otherInputAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                ],
                height: otherInputAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 56],
                }),
                overflow: "hidden",
              }}
            >
              <View style={styles.customCategoryRow}>
                <TextInput
                  style={styles.customCategoryInput}
                  value={customCategoryInput}
                  onChangeText={setCustomCategoryInput}
                  placeholder="Add your own category"
                  placeholderTextColor="#999"
                  returnKeyType="done"
                  autoCapitalize="words"
                  onSubmitEditing={addCustomCategory}
                  editable={isOtherSelected}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.customCategoryAddBtn,
                    !customCategoryInput.trim() &&
                      styles.customCategoryAddBtnDisabled,
                    pressed && styles.customCategoryAddBtnPressed,
                  ]}
                  disabled={!customCategoryInput.trim()}
                  onPress={addCustomCategory}
                  accessibilityRole="button"
                  accessibilityLabel="Add custom category"
                >
                  <Plus size={20} color="#fff" strokeWidth={2.6} />
                </Pressable>
              </View>
            </Animated.View>
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

            {/* Community photo picker */}
            <View style={styles.sectionHeader}>
              <CameraIcon size={16} color="#666" />
              <Text style={styles.sectionLabel}>Community Photo</Text>
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

        {/* ── Primary CTA ────────────────────────────────────────────────── */}
        <View style={styles.buttonRow}>
          <Button
            label={step === TOTAL_STEPS - 1 ? "Create Community" : "Next"}
            variant="default"
            loading={loading}
            icon={
              <ArrowRightIcon size={16} strokeWidth={3} color={Colors.light} />
            }
            iconPosition="right"
            onPress={handleNext}
            style={styles.nextButton}
          />
        </View>
      </ScrollView>

      {/* ── Success modal ───────────────────────────────────────────────── */}
      <Modal
        visible={successModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (createdCommunity) handleSuccessGo();
        }}
      >
        <View style={styles.successBackdrop}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <CheckCircle2 size={56} color={Colors.accent} strokeWidth={2.2} />
            </View>
            <Text style={styles.successTitle}>Community created!</Text>
            <Text style={styles.successBody}>
              <Text style={styles.successBodyEmphasis}>
                &ldquo;
                {createdCommunity?.name ?? name.trim()}
                &rdquo;
              </Text>{" "}
              is live. You&rsquo;re the owner — invite friends and start the
              conversation.
            </Text>
            <Button
              label="Go to Community"
              variant="default"
              onPress={handleSuccessGo}
              style={styles.successPrimaryBtn}
            />
            <Pressable
              onPress={() => {
                setSuccessModalVisible(false);
                navigation.navigate("CommunityList");
              }}
              hitSlop={8}
            >
              <Text style={styles.successSecondary}>Back to communities</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#eee",
  },
  // Labeled accent pill shown on the non-first wizard steps so the
  // "you can walk back" affordance reads loud and clear instead of being
  // a tiny grey arrow.
  backPillButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1.25,
    borderColor: Colors.accent,
  },
  backPillLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.accent,
  },
  backIconButtonPressed: {
    opacity: 0.75,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
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
  // Subtle faded state for user-added custom chips when they're toggled
  // off — they stay in the chip list (the user added them, they can
  // re-enable later) but visually communicate "currently off".
  chipCustomDisabled: {
    opacity: 0.55,
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
  // Custom-category input row revealed under the "Other" chip.
  customCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  customCategoryInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
  },
  customCategoryAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  customCategoryAddBtnDisabled: {
    backgroundColor: "#ccc",
  },
  customCategoryAddBtnPressed: {
    opacity: 0.8,
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
    fontSize: 12,
    maxWidth: 90,
    color: "#aaa",
    textAlign: "center",
  },
  // Type chooser
  typeStack: {
    gap: 10,
  },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#e5e5e5",
    backgroundColor: "#fff",
  },
  typeCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "12",
  },
  typeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f4f4f4",
    alignItems: "center",
    justifyContent: "center",
  },
  typeIconWrapSelected: {
    backgroundColor: "#fff",
  },
  typeTextGroup: {
    flex: 1,
  },
  typeLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  typeLabelSelected: {
    color: Colors.dark,
  },
  typeDescription: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#777",
    marginTop: 2,
    lineHeight: 16,
  },
  typeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  typeRadioSelected: {
    borderColor: Colors.accent,
  },
  typeRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  // Buttons
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
  },
  nextButton: {
    flex: 1,
  },
  // Success modal
  successBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  successCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  successIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.accent + "1A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    textAlign: "center",
    marginBottom: 8,
  },
  successBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
  },
  successBodyEmphasis: {
    fontFamily: Fonts.gabarito.semiBold,
    color: Colors.dark,
  },
  successPrimaryBtn: {
    alignSelf: "stretch",
    marginBottom: 12,
  },
  successSecondary: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#777",
    paddingVertical: 6,
    textAlign: "center",
  },
});
