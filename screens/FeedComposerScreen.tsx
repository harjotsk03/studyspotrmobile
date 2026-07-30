import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Camera,
  Crop,
  ImagePlus,
  RotateCcw,
  X,
  Zap,
  ZapOff,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import {
  createFeedPostMultipart,
  MAX_FEED_CAPTION_LENGTH,
  MAX_FEED_UPLOAD_BYTES,
  type FeedPost,
  type LocalFeedMediaFile,
} from "../utils/feedApi";
import Button from "../components/Button";
import ImageStagingModal from "../components/ImageStagingModal";
import type { RootStackParamList } from "../types/navigation";

const { width: SCREEN_W } = Dimensions.get("window");

type NavProp = NativeStackNavigationProp<RootStackParamList, "FeedComposer">;

function assetToUploadFile(
  uri: string,
  mimeType?: string,
  fileName?: string,
): LocalFeedMediaFile {
  return {
    uri,
    mimeType: mimeType ?? "image/jpeg",
    fileName: fileName ?? `photo_${Date.now()}.jpg`,
    mediaType: "image",
  };
}

export default function FeedComposerScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [selectedAsset, setSelectedAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Camera
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const scrollRef = useRef<ScrollView>(null);

  const posted = useRef(false);
  const userActed = useRef(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  // Crop staging
  const [stagingVisible, setStagingVisible] = useState(false);
  const [stagingAssets, setStagingAssets] = useState<
    ImagePicker.ImagePickerAsset[]
  >([]);

  // Request camera permission on mount
  useEffect(() => {
    if (!cameraPermission?.granted) {
      requestCameraPermission();
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || !cameraReady) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92 });
      if (!photo?.uri) return;
      userActed.current = true;
      setCameraActive(false);
      setSelectedAsset({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        type: "image",
      } as ImagePicker.ImagePickerAsset);
    } catch {
      Alert.alert("Capture failed", "Could not take photo. Try again.");
    }
  }, [cameraReady]);

  const pickFromLibrary = useCallback(async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to select images.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
    });
    if (result.canceled || !result.assets?.[0]) return;
    userActed.current = true;
    setCameraActive(false);
    setSelectedAsset(result.assets[0]);
  }, []);

  const retakePhoto = useCallback(() => {
    setCameraActive(true);
    setSelectedAsset(null);
    setCameraReady(false);
  }, []);

  const openCrop = useCallback(() => {
    if (!selectedAsset) return;
    setStagingAssets([selectedAsset]);
    setStagingVisible(true);
  }, [selectedAsset]);

  const handleStagingConfirm = useCallback(
    (assets: ImagePicker.ImagePickerAsset[]) => {
      setStagingVisible(false);
      if (assets.length > 0) {
        setSelectedAsset(assets[0]);
      }
    },
    [],
  );

  const handleStagingCancel = useCallback(() => {
    setStagingVisible(false);
  }, []);

  const submit = useCallback(async () => {
    if (!token) {
      Alert.alert("Sign in required", "Sign in to post.");
      return;
    }
    if (!selectedAsset) {
      Alert.alert("Add a photo", "Take or select a photo first.");
      return;
    }

    const trimmed = caption.trim();
    if (trimmed.length > MAX_FEED_CAPTION_LENGTH) {
      Alert.alert(
        "Caption too long",
        `Keep your caption under ${MAX_FEED_CAPTION_LENGTH} characters.`,
      );
      return;
    }

    try {
      const info = await FileSystem.getInfoAsync(selectedAsset.uri);
      const size =
        info.exists &&
        !info.isDirectory &&
        "size" in info &&
        typeof info.size === "number"
          ? info.size
          : undefined;
      if (size !== undefined && size > MAX_FEED_UPLOAD_BYTES) {
        Alert.alert("File too large", "Choose a photo under 50 MB.");
        return;
      }
    } catch {}

    setSubmitting(true);
    try {
      const post = await createFeedPostMultipart(token, {
        visibility: "friends_only",
        caption: trimmed.length ? trimmed : null,
        files: [
          assetToUploadFile(
            selectedAsset.uri,
            selectedAsset.mimeType ?? undefined,
            selectedAsset.fileName ?? undefined,
          ),
        ],
      });
      DeviceEventEmitter.emit("feedPostCreated", post);
      posted.current = true;
      navigation.goBack();
    } catch (e) {
      Alert.alert(
        "Couldn't post",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [selectedAsset, caption, token, navigation]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    if (userActed.current || caption.trim().length > 0) {
      setShowDiscardModal(true);
      return;
    }
    posted.current = true;
    navigation.goBack();
  }, [submitting, caption, navigation]);

  const confirmDiscard = useCallback(() => {
    setShowDiscardModal(false);
    posted.current = true;
    navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (posted.current) return;
      if (!userActed.current && caption.trim().length === 0) return;
      if (submitting) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      setShowDiscardModal(true);
    });
    return unsubscribe;
  }, [navigation, caption, submitting]);

  const showCamera = cameraActive && cameraPermission?.granted;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleClose}
          hitSlop={12}
          disabled={submitting}
        >
          <X size={26} color={Colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New post</Text>
        <TouchableOpacity
          onPress={() => void submit()}
          disabled={submitting || !selectedAsset}
          hitSlop={12}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text
              style={[
                styles.headerShare,
                (!selectedAsset || submitting) && styles.headerShareDisabled,
              ]}
            >
              Share
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* Square area — camera or preview */}
          <View style={styles.previewContainer}>
            {showCamera ? (
              <View style={styles.previewSquare}>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing={facing}
                  flash={flash ? "on" : "off"}
                  onCameraReady={() => setCameraReady(true)}
                />
                {/* Top-right controls */}
                <View style={styles.cameraOverlay}>
                  <TouchableOpacity
                    style={styles.cameraCtrl}
                    onPress={() =>
                      setFacing((f) => (f === "back" ? "front" : "back"))
                    }
                  >
                    <RotateCcw size={22} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cameraCtrl}
                    onPress={() => setFlash((f) => !f)}
                  >
                    {flash ? (
                      <Zap size={22} color="#FFD700" />
                    ) : (
                      <ZapOff size={22} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
                {/* Bottom bar: library + shutter */}
                <View style={styles.bottomBar}>
                  <TouchableOpacity
                    style={styles.bottomBarSide}
                    onPress={pickFromLibrary}
                  >
                    <ImagePlus size={26} color="#fff" />
                    <Text style={styles.bottomBarLabel}>Library</Text>
                  </TouchableOpacity>
                  <Pressable
                    style={styles.shutterBtn}
                    onPress={capturePhoto}
                    disabled={!cameraReady}
                  >
                    <View
                      style={[
                        styles.shutterInner,
                        !cameraReady && { opacity: 0.4 },
                      ]}
                    />
                  </Pressable>
                  <View style={styles.bottomBarSide} />
                </View>
              </View>
            ) : selectedAsset ? (
              <View style={styles.previewSquare}>
                <Image
                  source={{ uri: selectedAsset.uri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                {/* Overlay action buttons */}
                <View style={styles.previewActions}>
                  <TouchableOpacity
                    style={styles.previewActionBtn}
                    onPress={openCrop}
                  >
                    <Crop size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.previewActionBtn}
                    onPress={retakePhoto}
                  >
                    <Camera size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.previewActionBtn}
                    onPress={pickFromLibrary}
                  >
                    <ImagePlus size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.previewSquare, styles.previewEmpty]}>
                <Text style={styles.previewEmptyText}>
                  Camera permission required
                </Text>
                <Pressable
                  style={styles.permissionBtn}
                  onPress={() => requestCameraPermission()}
                >
                  <Text style={styles.permissionBtnLabel}>Allow camera</Text>
                </Pressable>
                <TouchableOpacity
                  style={[styles.permissionBtn, { marginTop: 12, backgroundColor: "#444" }]}
                  onPress={pickFromLibrary}
                >
                  <Text style={styles.permissionBtnLabel}>
                    Choose from library
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Caption — only when we have a photo */}
          {selectedAsset && !cameraActive && (
            <View style={styles.captionSection}>
              <Text style={styles.sectionLabel}>Caption</Text>
              <TextInput
                style={styles.captionInput}
                placeholder="Say something about your study spot or session..."
                placeholderTextColor="#999"
                multiline
                maxLength={MAX_FEED_CAPTION_LENGTH}
                value={caption}
                onChangeText={(t) => {
                  setCaption(t);
                  if (t.trim().length > 0) userActed.current = true;
                }}
                onFocus={() => {
                  setTimeout(() => {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  }, 300);
                }}
                editable={!submitting}
              />
              <Text style={styles.charCount}>
                {caption.length}/{MAX_FEED_CAPTION_LENGTH}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Posting overlay */}
      {submitting && (
        <View style={styles.postingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.postingText}>Posting...</Text>
        </View>
      )}

      {/* Discard confirmation modal */}
      <Modal
        visible={showDiscardModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDiscardModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowDiscardModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Discard Post?</Text>
            <Text style={styles.modalBody}>
              You'll lose your current draft. This can't be undone.
            </Text>
            <View style={styles.modalActions}>
              <View style={styles.modalActionCell}>
                <Button
                  label="Keep editing"
                  variant="secondary"
                  fullWidth
                  onPress={() => setShowDiscardModal(false)}
                />
              </View>
              <View style={styles.modalActionCell}>
                <Button
                  label="Discard"
                  variant="destructive"
                  fullWidth
                  onPress={confirmDiscard}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Crop staging modal */}
      <ImageStagingModal
        visible={stagingVisible}
        images={stagingAssets}
        initialIndex={0}
        onConfirm={handleStagingConfirm}
        onCancel={handleStagingCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
  },
  headerTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  headerShare: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.primary,
  },
  headerShareDisabled: {
    color: "#bbb",
  },
  previewContainer: {
    width: SCREEN_W,
    aspectRatio: 1,
    backgroundColor: "#111",
  },
  previewSquare: {
    flex: 1,
  },
  previewEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a1a",
    gap: 8,
  },
  previewEmptyText: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 16,
    color: "#888",
    marginBottom: 16,
  },
  previewActions: {
    position: "absolute",
    bottom: 14,
    right: 14,
    flexDirection: "row",
    gap: 10,
  },
  previewActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraOverlay: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    gap: 10,
  },
  cameraCtrl: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 12,
  },
  bottomBarSide: {
    width: 60,
    alignItems: "center",
    gap: 4,
  },
  bottomBarLabel: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 11,
    color: "#fff",
  },
  shutterBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
  captionSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#777",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  captionInput: {
    minHeight: 100,
    maxHeight: 180,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: Colors.dark,
    backgroundColor: "#fff",
    textAlignVertical: "top",
  },
  charCount: {
    alignSelf: "flex-end",
    marginTop: 6,
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#aaa",
  },
  postingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    gap: 14,
  },
  postingText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: "#fff",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.dark,
    textAlign: "center",
  },
  modalBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalActionCell: {
    flex: 1,
  },
  permissionBtn: {
    backgroundColor: Colors.dark,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  permissionBtnLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: "#fff",
  },
});
