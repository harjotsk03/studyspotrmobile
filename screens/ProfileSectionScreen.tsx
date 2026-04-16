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
import { API_BASE_URL } from '../constants/Api';
import { type UserProfileData, useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import DeleteAccountModal from '../components/DeleteAccountModal';
import Input from '../components/Input';

export type ProfileSectionKey = 'personal' | 'school' | 'location' | 'settings';

export type ProfileStackParamList = {
  ProfileHome: undefined;
  ProfileSection: { section: ProfileSectionKey };
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
  };
}

export default function ProfileSectionScreen({ route, navigation }: Props) {
  const { section } = route.params;
  const insets = useSafeAreaInsets();
  const { profile, token, updateProfile, logout } = useAuth();
  const user = profile?.userProfile;

  const [form, setForm] = useState<ProfileFormState>(() => createFormState(user));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    setForm(createFormState(user));
  }, [user]);

  const sectionConfig = useMemo(() => {
    switch (section) {
      case 'personal':
        return {
          title: 'Personal Details',
          description: 'Manage the basics people see on your profile.',
          buttonLabel: 'Save Personal Details',
        };
      case 'school':
        return {
          title: 'School',
          description: 'Keep your academic info up to date.',
          buttonLabel: 'Save School Details',
        };
      case 'location':
        return {
          title: 'Location',
          description: 'Update where you are based.',
          buttonLabel: 'Save Location',
        };
      case 'settings':
        return {
          title: 'Settings',
          description: 'Manage account actions and other sensitive changes.',
          buttonLabel: '',
        };
    }
  }, [section]);

  const handleSave = async () => {
    if (section === 'settings') {
      return;
    }

    if (!user?.id || !token) {
      Alert.alert('Error', 'Could not find your profile.');
      return;
    }

    if (section === 'personal' && (!form.first_name.trim() || !form.last_name.trim())) {
      Alert.alert('Missing info', 'First name and last name are required.');
      return;
    }

    const nextValues = {
      first_name: section === 'personal' ? form.first_name.trim() : normalizeValue(user.first_name).trim(),
      last_name: section === 'personal' ? form.last_name.trim() : normalizeValue(user.last_name).trim(),
      username: section === 'personal' ? form.username.trim() : normalizeValue(user.username).trim(),
      school: section === 'school' ? form.school.trim() : normalizeValue(user.school).trim(),
      field_of_study:
        section === 'school'
          ? form.field_of_study.trim()
          : normalizeValue(user.field_of_study).trim(),
      city: section === 'location' ? form.city.trim() : normalizeValue(user.city).trim(),
      country: section === 'location' ? form.country.trim() : normalizeValue(user.country).trim(),
      bio: normalizeValue(user.bio),
    };

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/update-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          ...nextValues,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to update profile.');
      }

      await updateProfile(data.user ?? nextValues);
      Alert.alert('Profile updated', 'Your changes were saved.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!token) {
      Alert.alert('Error', 'You are not logged in.');
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/deleteAccount`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? 'Failed to delete account');
      }

      setShowDeleteModal(false);
      await logout();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const renderForm = () => {
    if (section === 'settings') {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Danger Zone</Text>
          <Text style={styles.cardBody}>
            Deleting your account permanently removes your profile, memberships,
            saved content, and activity.
          </Text>
          <Button
            label="Delete Account"
            variant="destructive"
            size="lg"
            style={styles.saveButton}
            onPress={() => setShowDeleteModal(true)}
          />
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{sectionConfig.title}</Text>
        <Text style={styles.cardBody}>{sectionConfig.description}</Text>

        <View style={styles.form}>
          {section === 'personal' ? (
            <>
              <Input
                label="First Name"
                value={form.first_name}
                onChangeText={(value) => setForm((current) => ({ ...current, first_name: value }))}
              />
              <Input
                label="Last Name"
                containerStyle={styles.fieldGap}
                value={form.last_name}
                onChangeText={(value) => setForm((current) => ({ ...current, last_name: value }))}
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
                onChangeText={(value) => setForm((current) => ({ ...current, username: value }))}
              />
            </>
          ) : null}

          {section === 'school' ? (
            <>
              <Input
                label="School"
                value={form.school}
                onChangeText={(value) => setForm((current) => ({ ...current, school: value }))}
              />
              <Input
                label="Field of Study"
                containerStyle={styles.fieldGap}
                value={form.field_of_study}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, field_of_study: value }))
                }
              />
            </>
          ) : null}

          {section === 'location' ? (
            <>
              <Input
                label="City"
                value={form.city}
                onChangeText={(value) => setForm((current) => ({ ...current, city: value }))}
              />
              <Input
                label="Country"
                containerStyle={styles.fieldGap}
                value={form.country}
                onChangeText={(value) => setForm((current) => ({ ...current, country: value }))}
              />
            </>
          ) : null}
        </View>

        <Button
          label={sectionConfig.buttonLabel}
          variant="accent"
          size="lg"
          style={styles.saveButton}
          loading={saving}
          onPress={handleSave}
        />
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
        >
          {renderForm()}
        </ScrollView>
      </KeyboardAvoidingView>

      <DeleteAccountModal
        visible={showDeleteModal}
        deleting={deleting}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
      />
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
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  cardTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 24,
    color: Colors.dark,
  },
  cardBody: {
    marginTop: 8,
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
  },
  form: {
    marginTop: 20,
  },
  fieldGap: {
    marginTop: 12,
  },
  saveButton: {
    marginTop: 20,
    alignSelf: 'stretch',
  },
});
