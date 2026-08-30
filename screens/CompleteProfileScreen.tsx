import { type ReactNode, useMemo, useState } from "react";
import {
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
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  AtSignIcon,
  Bell,
  Lock,
  MapPin,
  Users,
  UserIcon,
} from "lucide-react-native";
import StudySpotrLogo from "../assets/studyspotrlogo.svg";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import {
  ACADEMIC_INTERESTS,
  FIELDS_OF_STUDY,
  INTERESTS,
  UNIVERSITIES,
} from "../constants/onboardingOptions";
import { useAuth } from "../context/AuthContext";
import Input from "../components/Input";
import Button from "../components/Button";
import FadeInUp from "../components/FadeInUp";
import SmoothProgressBar from "../components/SmoothProgressBar";
import { useAppAlert } from "../components/AppAlertModal";
import ChipPicker from "../components/onboarding/ChipPicker";
import SearchableSelect from "../components/onboarding/SearchableSelect";
import {
  registerPushNotifications,
  requestPushPermission,
} from "../utils/pushNotifications";
import { visibleUsername } from "../utils/profileCompleteness";

const STEPS = ["identity", "school", "interests", "photo", "permissions"] as const;
type Step = (typeof STEPS)[number];
const LOGO_SIZE = 44;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const { showAlert, modal: alertModal } = useAppAlert();
  const { profile, token, updateProfile, logout, replayWelcomeToast, uploadProfilePhoto } =
    useAuth();
  const user = profile?.userProfile;

  const initialFirst = useMemo(
    () => (typeof user?.first_name === "string" ? user.first_name.trim() : ""),
    [user?.first_name],
  );
  const initialLast = useMemo(
    () => (typeof user?.last_name === "string" ? user.last_name.trim() : ""),
    [user?.last_name],
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [username, setUsername] = useState(visibleUsername(user?.username));
  const [usernameError, setUsernameError] = useState("");
  const [school, setSchool] = useState(
    typeof user?.school === "string" ? user.school : "",
  );
  const [fieldOfStudy, setFieldOfStudy] = useState(
    typeof user?.field_of_study === "string" ? user.field_of_study : "",
  );
  const [interests, setInterests] = useState(asStringArray(user?.interests));
  const [academicInterests, setAcademicInterests] = useState(
    asStringArray(user?.academic_interests),
  );
  const [photoUri, setPhotoUri] = useState(
    typeof user?.profile_photo === "string" ? user.profile_photo : "",
  );
  const [contactsOn, setContactsOn] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [locationOn, setLocationOn] = useState(false);
  const [loading, setLoading] = useState(false);

  const step = STEPS[stepIndex];
  const needsName = !initialFirst || !initialLast;
  const progress = (stepIndex + 1) / STEPS.length;

  const saveProfile = async (payload: Record<string, unknown>) => {
    if (!token) {
      showAlert("Session expired", "Please sign in again.");
      await logout();
      return false;
    }

    const res = await fetch(`${API_BASE_URL}/api/v1/auth/update-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      showAlert("Couldn't save", data?.error || "Please try again.");
      return false;
    }
    await updateProfile(data?.user ?? payload);
    return true;
  };

  const saveIdentity = async () => {
    const nextFirst = firstName.trim();
    const nextLast = lastName.trim();
    const nextUsername = username.trim();

    if (needsName && (!nextFirst || !nextLast)) {
      showAlert("Almost there", "Please enter your first and last name.");
      return false;
    }
    if (!nextUsername) {
      setUsernameError("Please pick a username.");
      return false;
    }
    if (nextUsername.startsWith("_tmp_")) {
      setUsernameError("Please choose a different username.");
      return false;
    }

    const currentUsername = visibleUsername(user?.username);
    if (nextUsername !== currentUsername) {
      const checkRes = await fetch(`${API_BASE_URL}/api/v1/auth/check-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nextUsername }),
      });
      const checkData = await checkRes.json().catch(() => null);
      if (
        !checkRes.ok ||
        checkData?.exists ||
        checkData?.message !== "Username is available."
      ) {
        setUsernameError(
          checkData?.message || "This username is already taken.",
        );
        return false;
      }
    }

    return saveProfile({
      first_name: nextFirst || initialFirst,
      last_name: nextLast || initialLast,
      username: nextUsername,
    });
  };

  const handleNext = async () => {
    setLoading(true);
    try {
      if (step === "identity") {
        if (!(await saveIdentity())) return;
      } else if (step === "school") {
        if (!school.trim()) {
          showAlert("School required", "Please choose your university.");
          return;
        }
        if (
          !(await saveProfile({
            school: school.trim(),
            field_of_study: fieldOfStudy.trim() || null,
          }))
        ) {
          return;
        }
      } else if (step === "interests") {
        if (
          !(await saveProfile({
            interests,
            academic_interests: academicInterests,
          }))
        ) {
          return;
        }
      }

      if (stepIndex < STEPS.length - 1) {
        setStepIndex((current) => current + 1);
      }
    } catch {
      showAlert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (step === "interests") {
      setLoading(true);
      try {
        const saved = await saveProfile({
          interests,
          academic_interests: academicInterests,
        });
        if (saved) setStepIndex((current) => current + 1);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (step === "photo") {
      setStepIndex((current) => current + 1);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
      return;
    }
    void logout();
  };

  const pickPhoto = async (source: "library" | "camera") => {
    const options = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.85,
    };

    const permission =
      source === "library"
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAlert(
        "Permission needed",
        source === "library"
          ? "Allow photo library access to choose a profile picture."
          : "Allow camera access to take your profile photo.",
      );
      return;
    }

    const result =
      source === "library"
        ? await ImagePicker.launchImageLibraryAsync(options)
        : await ImagePicker.launchCameraAsync(options);
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    setLoading(true);
    try {
      await uploadProfilePhoto(asset.uri, {
        contentType: asset.mimeType ?? undefined,
        fileName: asset.fileName ?? undefined,
      });
      setPhotoUri(asset.uri);
    } catch (error) {
      showAlert(
        "Couldn't upload",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleContacts = async (next: boolean) => {
    if (!next) {
      setContactsOn(false);
      return;
    }
    setContactsOn(true);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") {
      setContactsOn(false);
      showAlert(
        "Contacts are optional",
        "If you change your mind later, you can allow contacts in Settings. We'll only use them to suggest people you might know.",
      );
    }
  };

  const togglePush = async (next: boolean) => {
    if (!next) {
      setPushOn(false);
      return;
    }
    setPushOn(true);
    const granted = await requestPushPermission();
    if (!granted) {
      setPushOn(false);
      showAlert(
        "Notifications are optional",
        "You can turn them on later in Settings. We only send things that actually matter to you — never spam.",
      );
      return;
    }
    if (token) {
      void registerPushNotifications(token);
    }
  };

  const toggleLocation = async (next: boolean) => {
    if (!next) {
      setLocationOn(false);
      return;
    }
    setLocationOn(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationOn(false);
      showAlert(
        "Location is optional",
        "Location helps you find groups, spots, and people nearby. It is never shared with other users. You can enable it later.",
      );
    }
  };

  const finish = async () => {
    setLoading(true);
    try {
      const saved = await saveProfile({ onboarding_completed: true });
      if (saved) replayWelcomeToast();
    } catch {
      showAlert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Step, { title: string; subtitle: string }> = {
    identity: {
      title: needsName ? "What's your name?" : "Pick a username",
      subtitle: needsName
        ? "Add your name and a username so friends can find you."
        : "This is how people will find you on StudySpotr.",
    },
    school: {
      title: "Where do you study?",
      subtitle: "We'll use this to connect you with people on your campus.",
    },
    interests: {
      title: "What are you into?",
      subtitle: "Pick up to 5 in each list — or skip and add them later.",
    },
    photo: {
      title: "Add a profile photo",
      subtitle: "A photo helps people recognize you when you study together.",
    },
    permissions: {
      title: "A couple of permissions",
      subtitle: "All optional. You can change these anytime in Settings.",
    },
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleBack}
            disabled={loading}
            style={styles.backCircle}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color={Colors.dark} strokeWidth={2.4} />
          </Pressable>
          <StudySpotrLogo
            width={LOGO_SIZE}
            height={LOGO_SIZE}
            color={Colors.primary}
          />
          <View style={styles.headerSpacer} />
        </View>
        <SmoothProgressBar progress={progress} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeInUp replayKey={step}>
          <Text style={styles.title}>{titles[step].title}</Text>
          <Text style={styles.subtitle}>{titles[step].subtitle}</Text>

          {step === "identity" ? (
            <>
              {needsName ? (
                <>
                  <Input
                    variant="floating"
                    label="First Name"
                    placeholder="First"
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    autoComplete="given-name"
                    containerStyle={styles.fieldGap}
                  />
                  <Input
                    variant="floating"
                    label="Last Name"
                    placeholder="Last"
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                    autoComplete="family-name"
                    containerStyle={styles.fieldGap}
                  />
                </>
              ) : null}
              <Input
                variant="floating"
                label="Username"
                placeholder="your_username"
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  if (usernameError) setUsernameError("");
                }}
                autoCapitalize="none"
                autoCorrect={false}
                icon={<AtSignIcon size={18} color="#999" />}
                error={usernameError}
                containerStyle={styles.fieldGap}
              />
              <View style={styles.privacyRow}>
                <Lock size={13} color="#999" />
                <Text style={styles.privacyText}>
                  We'll only show this information to people you connect with on
                  StudySpotr.
                </Text>
              </View>
            </>
          ) : null}

          {step === "school" ? (
            <>
              <SearchableSelect
                label="University"
                placeholder="Search your school"
                value={school}
                options={UNIVERSITIES}
                onChange={setSchool}
              />
              <SearchableSelect
                label="What are you studying?"
                placeholder="Search a program"
                value={fieldOfStudy}
                options={FIELDS_OF_STUDY}
                onChange={setFieldOfStudy}
                optional
              />
            </>
          ) : null}

          {step === "interests" ? (
            <>
              <ChipPicker
                title="Interests"
                subtitle={`Up to 5 · ${interests.length} selected`}
                options={INTERESTS}
                selected={interests}
                onChange={setInterests}
              />
              <ChipPicker
                title="Academic interests"
                subtitle={`Up to 5 · ${academicInterests.length} selected`}
                options={ACADEMIC_INTERESTS}
                selected={academicInterests}
                onChange={setAcademicInterests}
              />
            </>
          ) : null}

          {step === "photo" ? (
            <View style={styles.photoBlock}>
              <View style={styles.avatar}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatarImage} />
                ) : (
                  <UserIcon size={42} color="#bbb" />
                )}
              </View>
              <Button
                label={photoUri ? "Choose a different photo" : "Choose from library"}
                variant="default"
                onPress={() => void pickPhoto("library")}
                style={styles.photoButton}
              />
              <Button
                label="Take a photo"
                variant="outline"
                onPress={() => void pickPhoto("camera")}
              />
            </View>
          ) : null}

          {step === "permissions" ? (
            <View style={styles.permissionList}>
              <PermissionRow
                icon={<Users size={20} color={Colors.primary} />}
                title="Contacts"
                body="If you allow it, we can suggest people you might already know. We never store or share your contact list. Totally optional."
                value={contactsOn}
                onValueChange={(value) => void toggleContacts(value)}
              />
              <PermissionRow
                icon={<Bell size={20} color={Colors.primary} />}
                title="Notifications"
                body="We'll only ping you for things that actually matter — messages, invites, and activity you care about. Never spam."
                value={pushOn}
                onValueChange={(value) => void togglePush(value)}
              />
              <PermissionRow
                icon={<MapPin size={20} color={Colors.primary} />}
                title="Location"
                body="Used to find groups, study spots, and people near you. Your live location is never shared with anyone else."
                value={locationOn}
                onValueChange={(value) => void toggleLocation(value)}
              />
            </View>
          ) : null}
        </FadeInUp>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {step === "interests" || step === "photo" ? (
          <Pressable onPress={() => void handleSkip()} disabled={loading}>
            <Text style={styles.skip}>Skip for now</Text>
          </Pressable>
        ) : null}
        {step === "permissions" ? (
          <Button
            label="Enter StudySpotr"
            variant="default"
            size="lg"
            loading={loading}
            onPress={() => void finish()}
          />
        ) : (
          <Button
            label="Continue"
            variant="default"
            size="lg"
            loading={loading}
            onPress={() => void handleNext()}
          />
        )}
      </View>
      {alertModal}
    </KeyboardAvoidingView>
  );
}

function PermissionRow({
  icon,
  title,
  body,
  value,
  onValueChange,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.permissionCard}>
      <View style={styles.permissionHeader}>
        <View style={styles.permissionIcon}>{icon}</View>
        <Text style={styles.permissionTitle}>{title}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: "#ddd", true: Colors.primary }}
          thumbColor="#fff"
        />
      </View>
      <Text style={styles.permissionBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 10,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontFamily: Fonts.gabarito.bold,
    color: Colors.dark,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: "#666",
    marginBottom: 24,
    lineHeight: 22,
  },
  fieldGap: {
    marginBottom: 12,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    paddingRight: 8,
  },
  privacyText: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    lineHeight: 18,
    color: "#888",
  },
  photoBlock: {
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E2E2",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  photoButton: {
    alignSelf: "stretch",
  },
  permissionList: {
    gap: 12,
  },
  permissionCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EFEFEF",
  },
  permissionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  permissionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EEF5FC",
    alignItems: "center",
    justifyContent: "center",
  },
  permissionTitle: {
    flex: 1,
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  permissionBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    lineHeight: 19,
    color: "#666",
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 8,
    gap: 12,
  },
  skip: {
    textAlign: "center",
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: "#888",
    paddingVertical: 4,
  },
});
