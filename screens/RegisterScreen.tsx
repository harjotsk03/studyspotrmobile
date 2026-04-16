import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Input from "../components/Input";
import Button from "../components/Button";
import { ArrowRightIcon, AtSignIcon, LockIcon, MailIcon, UserIcon } from "lucide-react-native";

const TOTAL_STEPS = 3;

const STEP_SUBTITLES = [
  "What's your name and email?",
  "Create a secure password",
  "Pick a username",
];

export default function RegisterScreen() {
  const { login } = useAuth();
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

  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");

  const validateStep0 = async (): Promise<boolean> => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      Alert.alert("Error", "Please fill in all fields.");
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
      Alert.alert("Network error", "Could not reach the server.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const validateStep1 = (): boolean => {
    let valid = true;

    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
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

  const validateStep2 = async (): Promise<boolean> => {
    if (!username.trim()) {
      setUsernameError("Please enter a username.");
      return false;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/check-username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();

      if (!res.ok || data.exists || data.message != "Username is available.") {
        setUsernameError(data.message || "This username is already taken.");
        return false;
      }

      setUsernameError("");
      return true;
    } catch {
      Alert.alert("Network error", "Could not reach the server.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      if (await validateStep0()) setStep(1);
    } else if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (await validateStep2()) handleRegister();
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          username,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert("Register failed", data.error || "Something went wrong.");
        return;
      }

      await login(data.user, data.access_token, data.refresh_token);
    } catch {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

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
        <Text style={styles.title}>Create an Account</Text>
        <Text style={styles.subtitle}>{STEP_SUBTITLES[step]}</Text>

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

        {step === 0 && (
          <>
            <View style={styles.nameRow}>
              <Input
                label="First Name"
                placeholder="First"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoComplete="given-name"
                icon={<UserIcon size={18} color="#999" />}
                containerStyle={styles.nameField}
              />
              <Input
                label="Last Name"
                placeholder="Last"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoComplete="family-name"
                icon={<UserIcon size={18} color="#999" />}
                containerStyle={styles.nameField}
              />
            </View>

            <Input
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
              icon={<MailIcon size={18} color="#999" />}
              error={emailError}
              containerStyle={styles.fieldGap}
            />
          </>
        )}

        {step === 1 && (
          <>
            <Input
              label="Password"
              placeholder="At least 6 characters"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (passwordError) setPasswordError("");
              }}
              secureTextEntry
              autoComplete="new-password"
              icon={<LockIcon size={18} color="#999" />}
              error={passwordError}
            />

            <Input
              label="Confirm Password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (confirmError) setConfirmError("");
              }}
              secureTextEntry
              autoComplete="new-password"
              icon={<LockIcon size={18} color="#999" />}
              error={confirmError}
              containerStyle={styles.fieldGap}
            />
          </>
        )}

        {step === 2 && (
          <Input
            label="Username"
            placeholder="your_username"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              if (usernameError) setUsernameError("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            icon={<AtSignIcon size={18} color="#999" />}
            error={usernameError}
          />
        )}

        <View style={styles.buttonRow}>
          {step > 0 && (
            <Button
              label="Back"
              variant="accent"
              onPress={() => setStep(step - 1)}
              style={styles.backButton}
            />
          )}
          <Button
            label={step === TOTAL_STEPS - 1 ? "Create Account" : "Next"}
            variant="default"
            loading={loading}
            icon={<ArrowRightIcon size={16} strokeWidth={3} color={Colors.light} />}
            iconPosition="right"
            onPress={handleNext}
            style={styles.nextButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
  nameRow: {
    flexDirection: "row",
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  fieldGap: {
    marginTop: 16,
  },
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
