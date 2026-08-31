import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { FIELDS_OF_STUDY, UNIVERSITIES } from '../constants/onboardingOptions';
import { API_BASE_URL } from '../constants/Api';
import { type UserProfileData, useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/Button';
import Input from '../components/Input';
import SearchableSelect from '../components/onboarding/SearchableSelect';
import type { FeedPost } from '../utils/feedApi';
import type { UserPostsFeedParams } from './UserPostsFeedScreen';

export type ProfileSectionKey = 'personal' | 'school' | 'location' | 'settings';

export type ProfileStackParamList = {
  ProfileHome: undefined;
  Settings: undefined;
  ProfileSection: { section: ProfileSectionKey };
  FeedPostDetail: { post: FeedPost };
  UserPostsFeed: UserPostsFeedParams;
};

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileSection'>;

type ProfileFormState = {
  first_name: string;
  last_name: string;
  username: string;
  school: string;
  field_of_study: string;
  city: string;
  country: string;
  bio: string;
};

function normalizeValue(value: unknown) {
  return typeof value === 'string' ? value : value?.toString() ?? '';
}

function createFormState(user?: UserProfileData): ProfileFormState {
  return {
    first_name: normalizeValue(user?.first_name),
    last_name: normalizeValue(user?.last_name),
    username: normalizeValue(user?.username),
    school: normalizeValue(user?.school),
    field_of_study: normalizeValue(user?.field_of_study),
    city: normalizeValue(user?.city),
    country: normalizeValue(user?.country),
    bio: normalizeValue(user?.bio),
  };
}

export default function ProfileSectionScreen({ route, navigation }: Props) {
  const { section } = route.params;
  const insets = useSafeAreaInsets();
  const { profile, token, updateProfile, logout } = useAuth();
  const { showToast } = useToast();
  const user = profile?.userProfile;

  const [form, setForm] = useState<ProfileFormState>(() =>
    createFormState(user),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setForm(createFormState(user));
  }, [user]);

  const sectionConfig = useMemo(() => {
    switch (section) {
      case "personal":
        return {
          title: "Personal Details",
          description: "Manage the basics people see on your profile.",
          buttonLabel: "Save",
        };
      case "school":
        return {
          title: "School",
          description: "We'll use this to connect you with people on your campus.",
          buttonLabel: "Save",
        };
      case "location":
        return {
          title: "Location",
          description: "Update where you are based.",
          buttonLabel: "Save",
        };
      case "settings":
        return {
          title: "Delete account",
          description:
            "Deleting your account permanently removes your profile, memberships, saved content, and activity.",
          buttonLabel: "",
        };
    }
  }, [section]);

  const getErrorMessage = (data: unknown) => {
    if (!data || typeof data !== "object") {
      return "";
    }

    const error = "error" in data ? data.error : undefined;
    const message = "message" in data ? data.message : undefined;
    return typeof error === "string"
      ? error
      : typeof message === "string"
        ? message
        : "";
  };

  const shouldLogoutForExpiredToken = (status: number, data: unknown) => {
    const message = getErrorMessage(data).toLowerCase();
    return (
      status === 403 ||
      message.includes("expired token") ||
      message.includes("token expired") ||
      message.includes("jwt expired")
    );
  };

  const fetchWithAuthGuard = async (
    request: (accessToken: string) => Promise<Response>,
  ) => {
    if (!token) {
      throw new Error("You are not logged in.");
    }

    const response = await request(token);
    const data = await response.json().catch(() => null);

    if (shouldLogoutForExpiredToken(response.status, data)) {
      await logout();
      throw new Error(
        getErrorMessage(data) || "Session expired. Please log in again.",
      );
    }

    return { response, data };
  };

  const handleSave = async () => {
    if (section === "settings") {
      return;
    }

    if (!user?.id) {
      Alert.alert("Error", "Could not find your profile.");
      return;
    }

    if (
      section === "personal" &&
      (!form.first_name.trim() || !form.last_name.trim())
    ) {
      Alert.alert("Missing info", "First name and last name are required.");
      return;
    }

    /** Only send fields from this section; server applies partial merge. Omit `user_id`. */
    const bodyPayload = ((): Record<string, string | null> => {
      if (section === "personal") {
        return {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          username: form.username.trim(),
          bio: form.bio.trim().length === 0 ? null : form.bio.trim(),
        };
      }

      if (section === "school") {
        return {
          school: form.school.trim().length === 0 ? null : form.school.trim(),
          field_of_study:
            form.field_of_study.trim().length === 0
              ? null
              : form.field_of_study.trim(),
        };
      }

      return {
        city: form.city.trim().length === 0 ? null : form.city.trim(),
        country: form.country.trim().length === 0 ? null : form.country.trim(),
      };
    })();

    setSaving(true);
    try {
      const { response, data } = await fetchWithAuthGuard((accessToken) =>
        fetch(`${API_BASE_URL}/api/v1/auth/update-profile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(bodyPayload),
        }),
      );

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            getErrorMessage(data) || "That username is already taken.",
          );
        }
        throw new Error(getErrorMessage(data) || "Failed to update profile.");
      }

      const serverUserRaw =
        data && typeof data === "object"
          ? ((data as Record<string, unknown>).user ??
            (data as Record<string, unknown>).profile)
          : null;

      if (
        serverUserRaw &&
        typeof serverUserRaw === "object" &&
        serverUserRaw !== null
      ) {
        await updateProfile(serverUserRaw as Partial<UserProfileData>);
      } else {
        await updateProfile(bodyPayload as Partial<UserProfileData>);
      }

      showToast("Profile updated");
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.message ?? "Something went wrong. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { response, data } = await fetchWithAuthGuard((accessToken) =>
        fetch(`${API_BASE_URL}/api/v1/auth/deleteAccount`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );

      if (!response.ok) {
        throw new Error(getErrorMessage(data) || "Failed to delete account");
      }

      await logout();
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.message ?? "Something went wrong. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteAccount = () => {
    if (deleting) return;
    Alert.alert(
      "Delete account",
      "This cannot be undone. Permanently delete your StudySpotr account?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: handleDeleteAccount,
        },
      ],
    );
  };

  const renderForm = () => {
    if (section === "settings") {
      return (
        <View>
          <Text style={styles.pageTitle}>Delete account</Text>
          <Text style={styles.pageBody}>{sectionConfig.description}</Text>
          <View style={styles.warningList}>
            <Text style={styles.warningItem}>
              {"\u2022"}  Your profile and personal info
            </Text>
            <Text style={styles.warningItem}>
              {"\u2022"}  Posts, comments, and activity
            </Text>
            <Text style={styles.warningItem}>
              {"\u2022"}  Community memberships
            </Text>
            <Text style={styles.warningItem}>
              {"\u2022"}  Saved content and preferences
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.pageBody}>{sectionConfig.description}</Text>

        <View style={styles.form}>
          {section === "personal" ? (
            <>
              <Input
                label="First Name"
                value={form.first_name}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, first_name: value }))
                }
              />
              <Input
                label="Last Name"
                containerStyle={styles.fieldGap}
                value={form.last_name}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, last_name: value }))
                }
              />
              <Input
                label="Email"
                containerStyle={styles.fieldGap}
                value={normalizeValue(user?.email)}
                editable={false}
              />
              <Input
                label="Username"
                containerStyle={styles.fieldGap}
                value={form.username}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, username: value }))
                }
              />
              <Input
                label="Bio"
                containerStyle={styles.fieldGap}
                inputStyle={{ minHeight: 100 }}
                value={form.bio}
                multiline
                textAlignVertical="top"
                placeholder="Tell others a bit about you"
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, bio: value }))
                }
              />
            </>
          ) : null}

          {section === "school" ? (
            <>
              <SearchableSelect
                label="University"
                placeholder="Search your school"
                value={form.school}
                options={UNIVERSITIES}
                onChange={(value) =>
                  setForm((current) => ({ ...current, school: value }))
                }
              />
              <SearchableSelect
                label="What are you studying?"
                placeholder="Search a program"
                value={form.field_of_study}
                options={FIELDS_OF_STUDY}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    field_of_study: value,
                  }))
                }
                optional
              />
            </>
          ) : null}

          {section === "location" ? (
            <>
              <Input
                label="City"
                value={form.city}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, city: value }))
                }
              />
              <Input
                label="Country"
                containerStyle={styles.fieldGap}
                value={form.country}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, country: value }))
                }
              />
            </>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {sectionConfig.title}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          automaticallyAdjustKeyboardInsets
        >
          {renderForm()}
        </ScrollView>
        {section === "settings" ? (
          <View
            style={[
              styles.deleteFooter,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <Button
              label="Delete account"
              variant="destructive"
              size="lg"
              fullWidth
              loading={deleting}
              disabled={deleting}
              onPress={confirmDeleteAccount}
            />
          </View>
        ) : (
          <View style={styles.saveFooter}>
            <Button
              label={sectionConfig.buttonLabel}
              variant="accent"
              size="sm"
              loading={saving}
              onPress={handleSave}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBEBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginHorizontal: 12,
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 24,
  },
  form: {
    marginTop: 16,
  },
  fieldGap: {
    marginTop: 12,
  },
  pageTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  pageBody: {
    marginTop: 4,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
    color: '#8A8F96',
  },
  warningList: {
    marginTop: 20,
    gap: 10,
  },
  warningItem: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
    color: '#8A8F96',
  },
  deleteFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  saveFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E2E2',
    backgroundColor: '#fff',
  },
});
