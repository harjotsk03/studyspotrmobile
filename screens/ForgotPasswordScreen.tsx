import { useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import Input from "../components/Input";
import Button from "../components/Button";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MailIcon } from "lucide-react-native";

type ForgotPasswordStep = "request" | "reset";
type AuthStackParamList = {
  LoginScreen: undefined;
  RegisterScreen: undefined;
  ForgotPasswordScreen: undefined;
};

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [step, setStep] = useState<ForgotPasswordStep>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [hasRequestedCode, setHasRequestedCode] = useState(false);
  const [resendHighlighted, setResendHighlighted] = useState(false);
  const [verifiedAccessToken, setVerifiedAccessToken] = useState("");
  const [verifiedUserId, setVerifiedUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const canVerifyCode = code.trim().length === 6 && !loading;
  const canSubmitNewPassword =
    newPassword.trim().length >= 6 &&
    confirmPassword.trim().length >= 6 &&
    newPassword === confirmPassword &&
    !loading;

  useEffect(() => {
    if (!showCodeModal || resendCountdown <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setResendCountdown((current) => current - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [showCodeModal, resendCountdown]);

  const requestResetCode = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      Alert.alert("Missing email", "Please enter your email address.");
      return false;
    }

    const res = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    return true;
  };

  const handleForgotPassword = async () => {
    setLoading(true);
    try {
      const success = await requestResetCode();

      if (!success) {
        return;
      }

      setCode("");
      setHasRequestedCode(true);
      setResendHighlighted(false);
      setResendCountdown(60);
      setShowCodeModal(true);
    } catch {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCountdown > 0) {
      return;
    }

    setResending(true);
    try {
      const success = await requestResetCode();

      if (!success) {
        return;
      }

      setCode("");
      setHasRequestedCode(true);
      setResendHighlighted(false);
      setResendCountdown(60);
      Alert.alert("Code resent", `We sent a new 6 digit code to ${email.trim()}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not resend the code.";
      Alert.alert("Resend failed", message);
    } finally {
      setResending(false);
    }
  };

  const checkCode = async () => {
    if (!email.trim() || !code) {
      Alert.alert("Missing email or code", "Please enter your email and code.");
      return false;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/auth/verify-reset-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), token: code }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setCode("");
        setResendHighlighted(true);
        Alert.alert("Verification failed", data.error || "Failed to verify reset code.");
        return false;
      }

      setVerifiedAccessToken(data.access_token ?? "");
      setVerifiedUserId(data.user?.id ?? "");
      setShowCodeModal(false);
      setResendHighlighted(false);
      setCode("");
      setStep("reset");
      return true;
    } catch {
      Alert.alert("Network error", "Could not reach the server.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("Missing password", "Please enter and confirm your new password.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Password too short", "Your new password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords do not match", "Please make sure both password fields match.");
      return;
    }

    if (!verifiedAccessToken) {
      Alert.alert("Session expired", "Please request a new reset code and try again.");
      setStep("request");
      return;
    }

    if (!verifiedUserId) {
      Alert.alert("Verification incomplete", "Please request a new reset code and try again.");
      setStep("request");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_password: newPassword.trim(),
          user_id: verifiedUserId,
          token: verifiedAccessToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert("Reset failed", data.error || "Could not reset your password.");
        return;
      }

      setStep("request");
      setEmail("");
      setCode("");
      setShowCodeModal(false);
      setResendCountdown(0);
      setHasRequestedCode(false);
      setResendHighlighted(false);
      setVerifiedAccessToken("");
      setVerifiedUserId("");
      setNewPassword("");
      setConfirmPassword("");

      Alert.alert("Password reset", "Your password has been reset. Log in now.", [
        {
          text: "OK",
          onPress: () => navigation.navigate("LoginScreen"),
        },
      ]);
    } catch {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = () => {
    Keyboard.dismiss();
    setShowCodeModal(false);
    setStep("request");
    setHasRequestedCode(false);
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setVerifiedAccessToken("");
    setVerifiedUserId("");
    setResendHighlighted(false);
    setResendCountdown(0);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.content}>
          <Text style={styles.title}>
            {step === "request" ? "Forgot Password" : "Create New Password"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "request"
              ? "Enter your email to reset your password."
              : `Choose a new password for ${email.trim()}.`}
          </Text>
        </View>

        {step === "request" ? (
          <>
            <Input
              label="Email"
              placeholder="Email"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (hasRequestedCode) {
                  setHasRequestedCode(false);
                  setCode("");
                  setResendHighlighted(false);
                  setResendCountdown(0);
                }
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              containerStyle={styles.fieldGap}
            />

            <Button
              label="Reset Password"
              variant="default"
              loading={loading}
              style={styles.resetPasswordButton}
              onPress={handleForgotPassword}
            />

            {hasRequestedCode && !showCodeModal && (
              <Button
                label="Enter Verification Code"
                variant="secondary"
                style={styles.reopenCodeButton}
                onPress={() => setShowCodeModal(true)}
              />
            )}
          </>
        ) : (
          <>
            <Input
              label="New Password"
              placeholder="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoComplete="new-password"
              containerStyle={styles.fieldGap}
            />

            <Input
              label="Confirm New Password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              containerStyle={styles.fieldGap}
            />

            <Button
              label="Save New Password"
              variant="accent"
              loading={loading}
              disabled={!canSubmitNewPassword}
              style={styles.resetPasswordButton}
              onPress={handleResetPassword}
            />

            <Button
              label="Use Different Email"
              variant="outline"
              style={styles.reopenCodeButton}
              onPress={handleChangeEmail}
            />
          </>
        )}
      </View>

      <Modal
        visible={showCodeModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowCodeModal(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={16}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              Keyboard.dismiss();
              setShowCodeModal(false);
            }}
          />
          <Pressable style={styles.modalSheet} onPress={Keyboard.dismiss}>
            <Text style={styles.modalTitle}>Enter 6 digit code</Text>
            <Text style={styles.modalSubtitle}>
              We sent a verification code to{" "}
              <Text style={styles.modalEmail}>{email.trim()}</Text>
            </Text>

            <Input
              label="Verification Code"
              placeholder="123456"
              value={code}
              onChangeText={(value) => setCode(value.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              containerStyle={styles.codeField}
            />

            <Text style={styles.helperText}>
              Enter the code from your email. You can resend a new code after the timer ends.
            </Text>

            <View style={styles.modalActions}>
              <Button
                label="Verify Code"
                variant="accent"
                loading={loading}
                size="lg"
                disabled={!canVerifyCode}
                onPress={checkCode}
                style={styles.modalButton}
              />
              <Button
                label={resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend Code"}
                variant={resendHighlighted ? "accent" : "secondary"}
                disabled={resendCountdown > 0}
                loading={resending}
                onPress={handleResendCode}
                style={styles.modalButton}
              />
              <Button
                label="Change Email"
                variant="outline"
                onPress={handleChangeEmail}
                style={styles.modalButton}
              />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 100,
    paddingBottom: 40,
  },
  content: {
    width: "100%",
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
  resetPasswordButton: {
    marginTop: 24,
  },
  reopenCodeButton: {
    marginTop: 12,
  },
  fieldGap: {
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: "#E8E8E8",
  },
  modalTitle: {
    fontSize: 28,
    fontFamily: Fonts.gabarito.bold,
    color: Colors.dark,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
  },
  modalEmail: {
    color: Colors.dark,
    fontFamily: Fonts.instrument.semiBold,
  },
  codeField: {
    marginTop: 24,
  },
  helperText: {
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    lineHeight: 20,
    color: "#666",
  },
  modalActions: {
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    alignSelf: "stretch",
  },
});
