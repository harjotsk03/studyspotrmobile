import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import StudySpotrLogo from "../assets/studyspotrlogo.svg";
import Input from "../components/Input";
import Button from "../components/Button";
import FadeInUp from "../components/FadeInUp";
import SmoothProgressBar from "../components/SmoothProgressBar";
import { useAppAlert } from "../components/AppAlertModal";
import AuthLegalNotice from "../components/AuthLegalNotice";
import { useLegalConsent } from "../hooks/useLegalConsent";
import type { AuthStackParamList } from "../types/navigation";
import {
  ArrowLeft,
  ArrowRightIcon,
  Check,
  Eye,
  EyeOff,
  X,
} from "lucide-react-native";

const TOTAL_STEPS = 2;

const STEP_SUBTITLES = [
  "What's your name and email?",
  "Create a secure password",
];

const PASSWORD_REQUIREMENTS = [
  {
    label: "Must be at least 6 characters",
    test: (value: string) => value.length >= 6,
  },
  {
    label: "Must have a special character",
    test: (value: string) => /[^A-Za-z0-9]/.test(value),
  },
  {
    label: "Must have one uppercase letter",
    test: (value: string) => /[A-Z]/.test(value),
  },
  {
    label: "Must have one lowercase letter",
    test: (value: string) => /[a-z]/.test(value),
  },
  {
    label: "Must have one number",
    test: (value: string) => /\d/.test(value),
  },
];

export default function RegisterScreen() {
  const { login } = useAuth();
  const { modal: legalModal, ensureConsent } = useLegalConsent();
  const { showAlert, modal: alertModal } = useAppAlert();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [showPasswordRules, setShowPasswordRules] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const passwordChecks = PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.test(password),
  }));
  const isPasswordStrong = passwordChecks.every(
    (requirement) => requirement.met,
  );
  const passwordVisibilityToggle = (
    <TouchableOpacity
      accessibilityLabel={showPasswords ? "Hide passwords" : "Show passwords"}
      accessibilityRole="button"
      activeOpacity={0.7}
      onPress={() => setShowPasswords((visible) => !visible)}
    >
      {showPasswords ? (
        <EyeOff size={18} color="#999" />
      ) : (
        <Eye size={18} color="#999" />
      )}
    </TouchableOpacity>
  );

  const validateStep0 = async (): Promise<boolean> => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      showAlert("Almost there", "Please fill in all fields.");
      return false;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/auth/check-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        },
      );
      const data = await res.json();

      console.log("validateStep0", data);

      if (!res.ok || data.exists) {
        setEmailError(data?.error || "This email is already taken.");
        return false;
      }

      if (!res.ok || data.message != "Email is available.") {
        setEmailError(data?.message || "This email is already taken.");
        return false;
      }

      setEmailError("");
      return true;
    } catch {
      showAlert("Network error", "Could not reach the server.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const validateStep1 = (): boolean => {
    let valid = true;

    if (!isPasswordStrong) {
      setPasswordError("Password must meet all strength requirements.");
      setShowPasswordRules(true);
      valid = false;
    } else {
      setPasswordError("");
    }

    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      valid = false;
    } else {
      setConfirmError("");
    }

    return valid;
  };

  const handleNext = async () => {
    if (step === 0) {
      if (await validateStep0()) setStep(1);
    } else if (step === 1) {
      if (validateStep1()) await handleRegister();
    }
  };

  const handleRegister = async () => {
    const accepted = await ensureConsent();
    if (!accepted) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert("Register failed", data.error || "Something went wrong.");
        return;
      }

      await login(data.user, data.access_token, data.refresh_token, true, false);
    } catch {
      showAlert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
      return;
    }
    navigation.goBack();
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
            style={styles.backCircle}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color={Colors.dark} strokeWidth={2.4} />
          </Pressable>
          <StudySpotrLogo width={44} height={44} color={Colors.primary} />
          <View style={styles.headerSpacer} />
        </View>
        <SmoothProgressBar progress={(step + 1) / TOTAL_STEPS} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeInUp replayKey={step}>
          <Text style={styles.title}>
            {step === 0 ? "What's your name?" : "Create a password"}
          </Text>
          <Text style={styles.subtitle}>{STEP_SUBTITLES[step]}</Text>

          {step === 0 && (
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
              <Input
                variant="floating"
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError("");
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                error={emailError}
                containerStyle={styles.fieldGap}
              />
            </>
          )}

          {step === 1 && (
            <>
              <Input
                variant="floating"
                label="Password"
                placeholder="Create a strong password"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (passwordError) setPasswordError("");
                }}
                onFocus={() => setShowPasswordRules(true)}
                onBlur={() => setShowPasswordRules(false)}
                secureTextEntry={!showPasswords}
                autoComplete="new-password"
                rightIcon={passwordVisibilityToggle}
                error={passwordError}
                containerStyle={styles.fieldGap}
              />

              {showPasswordRules && (
                <View style={styles.passwordRulesCard}>
                  <Text style={styles.passwordRulesTitle}>
                    Password must include:
                  </Text>
                  {passwordChecks.map((requirement) => (
                    <View key={requirement.label} style={styles.passwordRuleRow}>
                      <View
                        style={[
                          styles.passwordRuleIcon,
                          requirement.met
                            ? styles.passwordRuleIconMet
                            : styles.passwordRuleIconUnmet,
                        ]}
                      >
                        {requirement.met ? (
                          <Check size={12} strokeWidth={3} color="#fff" />
                        ) : (
                          <X size={12} strokeWidth={3} color="#fff" />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.passwordRuleText,
                          requirement.met && styles.passwordRuleTextMet,
                        ]}
                      >
                        {requirement.label}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <Input
                variant="floating"
                label="Confirm Password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  if (confirmError) setConfirmError("");
                }}
                secureTextEntry={!showPasswords}
                autoComplete="new-password"
                rightIcon={passwordVisibilityToggle}
                error={confirmError}
                containerStyle={styles.fieldGap}
              />
            </>
          )}
        </FadeInUp>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label={step === TOTAL_STEPS - 1 ? "Create Account" : "Continue"}
          variant="default"
          size="lg"
          loading={loading}
          icon={
            <ArrowRightIcon size={16} strokeWidth={3} color={Colors.light} />
          }
          iconPosition="right"
          onPress={handleNext}
        />
        <AuthLegalNotice style={styles.legal} />
        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => navigation.navigate("LoginScreen")}
        >
          <Text style={styles.loginLinkText}>
            Already have an account?{" "}
            <Text style={styles.loginLinkTextAccent}>Log in</Text>
          </Text>
        </TouchableOpacity>
      </View>
      {legalModal}
      {alertModal}
    </KeyboardAvoidingView>
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
  },
  fieldGap: {
    marginBottom: 12,
    marginTop: 0,
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 8,
  },
  passwordRulesCard: {
    backgroundColor: "#fff",
    borderColor: "#E5E7EB",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  passwordRulesTitle: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.dark,
    marginBottom: 8,
  },
  passwordRuleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  passwordRuleIcon: {
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  passwordRuleIconMet: {
    backgroundColor: "#16A34A",
  },
  passwordRuleIconUnmet: {
    backgroundColor: "#DC2626",
  },
  passwordRuleText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#666",
  },
  passwordRuleTextMet: {
    color: Colors.dark,
  },
  legal: {
    marginTop: 14,
  },
  loginLink: {
    alignItems: "center",
    marginTop: 14,
  },
  loginLinkText: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.regular,
    fontSize: 15,
    textAlign: "center",
  },
  loginLinkTextAccent: {
    color: Colors.accent,
    fontFamily: Fonts.gabarito.medium,
  },
});
