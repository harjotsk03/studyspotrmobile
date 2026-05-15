import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Video, ResizeMode } from "expo-av";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import {
  createFeedPostMultipart,
  MAX_FEED_CAPTION_LENGTH,
  MAX_FEED_UPLOAD_BYTES,
  type FeedPost,
  type LocalFeedMediaFile,
} from "../utils/feedApi";

type Props = {
  visible: boolean;
  token: string | null;
  onClose: () => void;
  /** Normalized post returned from API (author may be merged by parent). */
  onPosted: (post: FeedPost | null) => void;
};

function inferMediaType(asset: ImagePicker.ImagePickerAsset): "image" | "video" {
  const t = asset.type;
  if (t === "video") return "video";
  const mime = asset.mimeType?.toLowerCase() ?? "";
  if (mime.startsWith("video/")) return "video";
  return "image";
}

function assetToUploadFile(
  asset: ImagePicker.ImagePickerAsset,
): LocalFeedMediaFile {
  const mediaType = inferMediaType(asset);
  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    mediaType,
  };
}

export default function FeedComposerModal({
  visible,
  token,
  onClose,
  onPosted,
}: Props) {
  const insets = useSafeAreaInsets();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setAsset(null);
    setCaption("");
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [submitting, onClose, reset]);

  const validateAndSetAsset = useCallback(async (next: ImagePicker.ImagePickerAsset) => {
    try {
      const info = await FileSystem.getInfoAsync(next.uri);
      const size =
        info.exists &&
        !info.isDirectory &&
        "size" in info &&
        typeof info.size === "number"
          ? info.size
          : typeof next.fileSize === "number"
            ? next.fileSize
            : undefined;
      if (size !== undefined && size > MAX_FEED_UPLOAD_BYTES) {
        Alert.alert(
          "File too large",
          "Choose a photo or video under 50 MB.",
        );
        return;
      }
      setAsset(next);
    } catch {
      setAsset(next);
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to attach media.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.92,
      videoMaxDuration: 180,
    });

    if (result.canceled || !result.assets?.[0]) return;
    await validateAndSetAsset(result.assets[0]);
  }, [validateAndSetAsset]);

  const takeMedia = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow camera access to capture a photo or clip.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.92,
      videoMaxDuration: 180,
    });

    if (result.canceled || !result.assets?.[0]) return;
    await validateAndSetAsset(result.assets[0]);
  }, [validateAndSetAsset]);

  const submit = useCallback(async () => {
    if (!token) {
      Alert.alert("Sign in required", "Sign in to post.");
      return;
    }
    if (!asset) {
      Alert.alert("Add media", "Choose a photo or video first.");
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

    setSubmitting(true);
    try {
      const post = await createFeedPostMultipart(token, {
        visibility: "friends_only",
        caption: trimmed.length ? trimmed : null,
        files: [assetToUploadFile(asset)],
      });
      reset();
      onPosted(post);
      onClose();
    } catch (e) {
      Alert.alert(
        "Couldn't post",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [asset, caption, token, onPosted, onClose, reset]);

  const mediaType = asset ? inferMediaType(asset) : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[styles.sheet, { paddingTop: insets.top + 8 }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheetHeader}>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            disabled={submitting}
          >
            <Text style={styles.sheetCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>New post</Text>
          <TouchableOpacity
            onPress={() => void submit()}
            disabled={submitting || !asset}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Publish post"
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text
                style={[
                  styles.sheetPost,
                  (!asset || submitting) && styles.sheetPostDisabled,
                ]}
              >
                Share
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.sheetBody,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          {!asset ? (
            <View style={styles.emptyPick}>
              <Text style={styles.emptyTitle}>One photo or video</Text>
              <Text style={styles.emptySubtitle}>
                Up to 50 MB. Shared only with friends — add an optional caption.
              </Text>
              <Pressable
                style={styles.primaryPickBtn}
                onPress={() => void pickFromLibrary()}
              >
                <Text style={styles.primaryPickLabel}>Choose from library</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryPickBtn}
                onPress={() => void takeMedia()}
              >
                <Text style={styles.secondaryPickLabel}>Take photo or video</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.previewCard}>
                <TouchableOpacity
                  style={styles.clearPick}
                  onPress={() => setAsset(null)}
                  accessibilityLabel="Remove media"
                  disabled={submitting}
                >
                  <X size={22} color="#fff" strokeWidth={2.2} />
                </TouchableOpacity>
                <View style={styles.previewInner}>
                  {mediaType === "video" ? (
                    <Video
                      style={styles.previewMedia}
                      source={{ uri: asset.uri }}
                      resizeMode={ResizeMode.CONTAIN}
                      useNativeControls
                      isLooping={false}
                    />
                  ) : (
                    <Image
                      source={{ uri: asset.uri }}
                      style={styles.previewMedia}
                      resizeMode="contain"
                    />
                  )}
                </View>
              </View>

              <Text style={styles.sectionLabel}>Caption</Text>
              <TextInput
                style={styles.captionInput}
                placeholder="Say something about your study spot or session…"
                placeholderTextColor="#999"
                multiline
                maxLength={MAX_FEED_CAPTION_LENGTH}
                value={caption}
                onChangeText={setCaption}
                editable={!submitting}
              />
              <Text style={styles.charCount}>
                {caption.length}/{MAX_FEED_CAPTION_LENGTH}
              </Text>

              <Text style={styles.friendsOnlyHint}>
                Only friends can see this post.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e8e8",
  },
  sheetCancel: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 16,
    color: Colors.dark,
    width: 72,
  },
  sheetTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  sheetPost: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.primary,
    width: 72,
    textAlign: "right",
  },
  sheetPostDisabled: {
    color: "#bbb",
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  emptyPick: {
    alignItems: "stretch",
    paddingTop: 24,
  },
  emptyTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryPickBtn: {
    backgroundColor: Colors.dark,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryPickLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: "#fff",
  },
  secondaryPickBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
  },
  secondaryPickLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 16,
    color: Colors.dark,
  },
  previewCard: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111",
    marginBottom: 22,
    minHeight: 220,
    maxHeight: 360,
  },
  previewInner: {
    flex: 1,
    minHeight: 220,
    justifyContent: "center",
  },
  previewMedia: {
    width: "100%",
    minHeight: 220,
    maxHeight: 340,
    backgroundColor: "#111",
  },
  clearPick: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
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
  friendsOnlyHint: {
    marginTop: 14,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
    lineHeight: 20,
  },
});
