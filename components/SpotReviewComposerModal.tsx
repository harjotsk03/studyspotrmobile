import { useEffect, useMemo, useRef, useState } from "react";
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
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "./Button";
import ImageStagingModal from "./ImageStagingModal";
import Input from "./Input";
import { SkeletonBox } from "./Skeleton";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { UserProfileData } from "../context/AuthContext";
import {
  createReviewMultipart,
  updateReviewMultipart,
  spotReviewPhotoUrls,
  spotReviewPrimaryId,
  type SpotReview,
} from "../utils/spotsApi";

const THUMB_SIZE = 86;
const TOAST_IN_MS = 200;
const TOAST_OUT_MS = 160;

export type ComposerMode = "create" | "edit";

type Props = {
  visible: boolean;
  mode: ComposerMode;
  spotId: string;
  spotName?: string;
  /** Required when mode === "edit". */
  review?: SpotReview | null;
  currentUser?: UserProfileData | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

function reviewDisplayName(user: UserProfileData | null | undefined) {
  if (!user) return "Member";
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || user.username || user.email?.split("@")[0] || "Member";
}

function profilePhotoUri(user: UserProfileData | null | undefined): string | undefined {
  const p = user?.profile_photo?.trim?.() ?? user?.avatar?.trim?.();
  return p || undefined;
}

export default function SpotReviewComposerModal({
  visible,
  mode,
  spotId,
  spotName,
  review,
  currentUser,
  onClose,
  onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [newImages, setNewImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [removedUrls, setRemovedUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingImageCount, setPendingImageCount] = useState(0);
  const [loadingUris, setLoadingUris] = useState<Set<string>>(() => new Set());

  // Staging modal state
  const [stagingAssets, setStagingAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [stagingVisible, setStagingVisible] = useState(false);
  const [stagingInitialIdx, setStagingInitialIdx] = useState(0);
  type StagingIntent = "add" | "edit";
  const [stagingIntent, setStagingIntent] = useState<StagingIntent>("add");

  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const existingUrlsInitial = useMemo(() => {
    if (mode !== "edit" || !review) return [] as string[];
    return spotReviewPhotoUrls(review);
  }, [mode, review]);

  const displayedExisting = useMemo(
    () => existingUrlsInitial.filter((u) => !removedUrls.includes(u)),
    [existingUrlsInitial, removedUrls],
  );

  useEffect(() => {
    if (!visible) return;
    if (mode === "edit" && review) {
      setRating(typeof review.rating === "number" && review.rating > 0 ? review.rating : 5);
      setContent(typeof review.content === "string" ? review.content : "");
      setNewImages([]);
      setRemovedUrls([]);
    } else {
      setRating(5);
      setContent("");
      setNewImages([]);
      setRemovedUrls([]);
    }
    setPendingImageCount(0);
    setLoadingUris(new Set());
  }, [visible, mode, review]);

  const markUriLoaded = (uri: string) => {
    setLoadingUris((prev) => {
      if (!prev.has(uri)) return prev;
      const next = new Set(prev);
      next.delete(uri);
      if (next.size === 0 && pendingImageCount === 0) hideToast();
      return next;
    });
  };

  const showToast = () => {
    toastAnimRef.current?.stop();
    toastAnimRef.current = Animated.timing(toastAnim, {
      toValue: 1,
      duration: TOAST_IN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    toastAnimRef.current.start();
  };

  const hideToast = () => {
    toastAnimRef.current?.stop();
    toastAnimRef.current = Animated.timing(toastAnim, {
      toValue: 0,
      duration: TOAST_OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    toastAnimRef.current.start();
  };

  const openStaging = (assets: ImagePicker.ImagePickerAsset[], intent: StagingIntent, idx = 0) => {
    setStagingAssets(assets);
    setStagingIntent(intent);
    setStagingInitialIdx(idx);
    setStagingVisible(true);
  };

  const pickPhotos = async () => {
    const maxTotal = 5;
    const current = displayedExisting.length + newImages.length;
    const remaining = Math.max(0, maxTotal - current);
    if (remaining <= 0) {
      Alert.alert("Limit reached", "A review can have at most 5 images.");
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access.");
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
      });
    } catch {
      Alert.alert("Couldn't open library", "Try again in a moment.");
      return;
    }

    if (result.canceled || !result.assets?.length) return;
    const room = maxTotal - displayedExisting.length;
    const incoming = result.assets.slice(0, Math.max(0, room - newImages.length));
    if (incoming.length === 0) return;

    openStaging(incoming, "add");
  };

  const takePhoto = async () => {
    const maxTotal = 5;
    if (displayedExisting.length + newImages.length >= maxTotal) {
      Alert.alert("Limit reached", "A review can have at most 5 images.");
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to take a photo.");
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });
    } catch {
      Alert.alert("Couldn't open camera", "Try again in a moment.");
      return;
    }

    if (result.canceled || !result.assets?.length) return;
    openStaging(result.assets, "add");
  };

  const editNewImages = (idx: number) => {
    openStaging([...newImages], "edit", idx);
  };

  const handleStagingConfirm = (finals: ImagePicker.ImagePickerAsset[]) => {
    setStagingVisible(false);
    if (finals.length === 0) return;

    if (stagingIntent === "edit") {
      setNewImages(finals);
      return;
    }

    const maxTotal = 5;
    const room = maxTotal - displayedExisting.length;
    setPendingImageCount(finals.length);
    showToast();

    requestAnimationFrame(() => {
      setNewImages((prev) => [...prev, ...finals].slice(0, room));
      setLoadingUris((prev) => {
        const next = new Set(prev);
        for (const a of finals) next.add(a.uri);
        return next;
      });
      setPendingImageCount(0);
    });
  };

  const handleStagingCancel = () => {
    setStagingVisible(false);
  };

  const removeNew = (idx: number) => {
    const uri = newImages[idx]?.uri;
    if (uri) markUriLoaded(uri);
    setNewImages((p) => p.filter((_, j) => j !== idx));
  };

  const markExistingRemoved = (url: string) => {
    setRemovedUrls((p) => (p.includes(url) ? p : [...p, url]));
  };

  const submit = async () => {
    const uid = currentUser?.id;
    if (!uid) {
      Alert.alert("Sign in", "Sign in to post a review.");
      return;
    }
    const body = content.trim();
    if (body.length < 4) {
      Alert.alert("Review", "Please write at least a short review.");
      return;
    }

    const maxTotal = 5;
    if (displayedExisting.length + newImages.length > maxTotal) {
      Alert.alert("Too many photos", `Keep total images at or below ${maxTotal}.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === "create") {
        await createReviewMultipart(
          {
            spot_id: spotId,
            user_id: uid,
            content: body,
            rating,
            user_name: reviewDisplayName(currentUser),
            user_profile_photo: profilePhotoUri(currentUser),
            ...(typeof currentUser?.points === "number" ? { user_points: currentUser.points } : {}),
          },
          newImages.map((a) => ({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName })),
        );
      } else if (review) {
        const rid = spotReviewPrimaryId(review);
        if (!rid) throw new Error("Missing review id.");
        await updateReviewMultipart(
          {
            review_id: rid,
            spot_id: spotId,
            content: body,
            rating,
            ...(removedUrls.length > 0 ? { removed_image_urls: removedUrls } : {}),
          },
          newImages.map((a) => ({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName })),
        );
      }
      await onSuccess();
      onClose();
    } catch (e) {
      Alert.alert("Couldn't save review", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "create" ? "Write a review" : "Edit review";
  const showNewStrip = newImages.length > 0 || pendingImageCount > 0;
  const addingCount = pendingImageCount || loadingUris.size;
  const addingToastMessage =
    addingCount > 0
      ? `Adding ${addingCount} ${addingCount === 1 ? "photo" : "photos"}…`
      : "Adding photos…";

  const toastOpacity = toastAnim;
  const toastTranslateY = toastAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  const starButtons = (
    <View style={styles.starsWrap}>
      <Text style={styles.label}>Rating</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= rating;
          return (
            <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
              <Text style={filled ? styles.starFilled : styles.starEmpty}>★</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: Math.max(insets.top, 12) }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
        >
          <View style={styles.headerRow}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.headerCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.headerPlaceholder} />
          </View>
          {spotName ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {spotName}
            </Text>
          ) : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {starButtons}

            <Input
              label="Your review"
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              inputStyle={{ minHeight: 120 }}
              placeholder="Noise, crowds, plugs, vibes…"
            />

            <Text style={[styles.label, styles.photoHeading]}>Photos (optional · up to 5 total)</Text>
            <View style={styles.photoButtons}>
              <Pressable style={styles.addPhotoBtn} onPress={() => void pickPhotos()}>
                <ImagePlus size={17} color={Colors.primary} strokeWidth={2} />
                <Text style={styles.addPhotoText}>Library</Text>
              </Pressable>
              <Pressable style={styles.addPhotoBtn} onPress={() => void takePhoto()}>
                <Camera size={17} color={Colors.primary} strokeWidth={2} />
                <Text style={styles.addPhotoText}>Camera</Text>
              </Pressable>
            </View>

            {displayedExisting.length > 0 ? (
              <>
                <Text style={styles.minorLabel}>Existing</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.thumbStrip}>
                    {displayedExisting.map((url) => (
                      <View key={url} style={styles.thumbBox}>
                        <Image source={{ uri: url }} style={styles.thumbImg} resizeMode="cover" />
                        <Pressable style={styles.removeFab} onPress={() => markExistingRemoved(url)}>
                          <X size={14} color="#fff" strokeWidth={3} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : null}

            {showNewStrip ? (
              <>
                <Text style={styles.minorLabel}>New</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.thumbStrip}>
                    {newImages.map((a, idx) => {
                      const loading = loadingUris.has(a.uri);
                      return (
                        <Pressable
                          key={a.uri}
                          style={styles.thumbBox}
                          onPress={() => !loading && editNewImages(idx)}
                        >
                          {loading ? (
                            <View style={styles.thumbSkeleton}>
                              <SkeletonBox
                                width={THUMB_SIZE}
                                height={THUMB_SIZE}
                                radius={10}
                              />
                            </View>
                          ) : null}
                          <Image
                            source={{ uri: a.uri }}
                            style={[styles.thumbImg, loading && styles.thumbImgLoading]}
                            resizeMode="cover"
                            onLoadEnd={() => markUriLoaded(a.uri)}
                            onError={() => markUriLoaded(a.uri)}
                          />
                          {!loading ? (
                            <Pressable style={styles.removeFab} onPress={() => removeNew(idx)}>
                              <X size={14} color="#fff" strokeWidth={3} />
                            </Pressable>
                          ) : null}
                        </Pressable>
                      );
                    })}
                    {Array.from({ length: pendingImageCount }).map((_, i) => (
                      <View key={`pending-${i}`} style={styles.thumbBox}>
                        <SkeletonBox width={THUMB_SIZE} height={THUMB_SIZE} radius={10} />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : null}

            <Button
              label={mode === "create" ? "Post review" : "Save changes"}
              variant="default"
              loading={busy}
              onPress={() => void submit()}
              style={styles.submitBtn}
            />
          </ScrollView>
        </KeyboardAvoidingView>

        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.addingToastOverlay,
            { bottom: Math.max(insets.bottom, 16) + 12 },
            { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
          ]}
        >
          <Text style={styles.addingToastText}>{addingToastMessage}</Text>
        </Animated.View>

        <ImageStagingModal
          visible={stagingVisible}
          images={stagingAssets}
          initialIndex={stagingInitialIdx}
          onConfirm={handleStagingConfirm}
          onCancel={handleStagingCancel}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  flex: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerCancel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 16,
    color: Colors.primary,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  headerPlaceholder: { width: 64 },
  subtitle: {
    paddingHorizontal: 24,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 24, paddingBottom: 32 },
  label: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
    marginBottom: 6,
  },
  minorLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 12,
    color: "#888",
    marginTop: 12,
    marginBottom: 6,
  },
  photoHeading: { marginTop: 16 },
  starsWrap: { marginBottom: 12 },
  stars: { flexDirection: "row", gap: 6 },
  starFilled: {
    fontSize: 32,
    color: Colors.accent,
    lineHeight: 36,
  },
  starEmpty: {
    fontSize: 32,
    color: "#ddd",
    lineHeight: 36,
  },
  photoButtons: {
    flexDirection: "row",
    gap: 10,
  },
  addPhotoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1.5,
    borderColor: "#ccc",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: "#fff",
  },
  addPhotoText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.primary,
  },
  thumbStrip: { flexDirection: "row", flexWrap: "nowrap" },
  thumbBox: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    overflow: "hidden",
    marginRight: 10,
    backgroundColor: "#eee",
  },
  thumbSkeleton: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbImgLoading: { opacity: 0 },
  removeFab: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  addingToastOverlay: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(28, 28, 28, 0.92)",
    zIndex: 20,
    elevation: 8,
  },
  addingToastText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#fff",
  },
  submitBtn: { marginTop: 24 },
});
