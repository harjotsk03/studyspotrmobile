import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { isGoogleConfigured } from "../constants/OAuth";
import { useAuth } from "../context/AuthContext";
import Button from "./Button";
import GoogleGIcon from "./GoogleGIcon";
import AppleIcon from "./AppleIcon";
import {
  exchangeOAuthIdToken,
  getAppleIdToken,
  getGoogleIdTokenNative,
  isExpoGo,
  isOAuthCancelled,
  signInWithGoogleInBrowser,
} from "../utils/oauth";
import { useLegalConsent } from "../hooks/useLegalConsent";
import { useAppAlert } from "./AppAlertModal";

WebBrowser.maybeCompleteAuthSession();

type Props = {
  disabled?: boolean;
  intent?: "signin" | "signup";
  rememberMe?: boolean;
  divider?: "above" | "below" | "none";
  dividerLabel?: string;
  size?: "default" | "lg";
};

export default function SocialAuthButtons({
  disabled = false,
  intent = "signin",
  rememberMe = true,
  divider = "below",
  dividerLabel,
  size = "default",
}: Props) {
  const { login } = useAuth();
  const { modal: legalModal, ensureConsent } = useLegalConsent();
  const { showAlert, modal: alertModal } = useAppAlert();
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const blocked = disabled || busy !== null;
  const resolvedDividerLabel =
    dividerLabel ??
    (divider === "above" ? "or continue with" : "or continue with email");

  const finishOAuth = async (params: {
    provider: "google" | "apple";
    idToken: string;
    nonce?: string;
    firstName?: string;
    lastName?: string;
  }) => {
    const data = await exchangeOAuthIdToken(params);
    await login(
      data.user,
      data.access_token,
      data.refresh_token,
      rememberMe,
      !data.needs_onboarding,
    );
  };

  const handleGoogle = async () => {
    const accepted = await ensureConsent();
    if (!accepted) return;

    setBusy("google");
    try {
      if (!isExpoGo && isGoogleConfigured) {
        try {
          const native = await getGoogleIdTokenNative();
          await finishOAuth({
            provider: "google",
            idToken: native.idToken,
            firstName: native.firstName,
            lastName: native.lastName,
          });
          return;
        } catch (error) {
          if (isOAuthCancelled(error)) return;
          const message = error instanceof Error ? error.message : String(error);
          const nativeMissing =
            /native module|NativeEventEmitter|RNGoogleSignin|not available/i.test(
              message,
            );
          if (!nativeMissing) throw error;
        }
      }

      const data = await signInWithGoogleInBrowser();
      await login(
        data.user,
        data.access_token,
        data.refresh_token,
        rememberMe,
        !data.needs_onboarding,
      );
    } catch (error) {
      if (isOAuthCancelled(error)) return;
      showAlert(
        "Google sign-in failed",
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleApple = async () => {
    const accepted = await ensureConsent();
    if (!accepted) return;

    setBusy("apple");
    try {
      const apple = await getAppleIdToken();
      await finishOAuth({
        provider: "apple",
        idToken: apple.idToken,
        nonce: apple.nonce,
        firstName: apple.firstName,
        lastName: apple.lastName,
      });
    } catch (error) {
      if (isOAuthCancelled(error)) return;
      showAlert(
        "Apple sign-in failed",
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(null);
    }
  };

  const googleLabel =
    intent === "signup" ? "Continue with Google" : "Continue with Google";
  const appleLabel =
    intent === "signup" ? "Continue with Apple" : "Continue with Apple";

  const dividerRow =
    divider === "none" ? null : (
      <View
        style={[
          styles.dividerRow,
          divider === "above" ? styles.dividerAbove : styles.dividerBelow,
        ]}
      >
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{resolvedDividerLabel}</Text>
        <View style={styles.dividerLine} />
      </View>
    );

  return (
    <>
      <View style={styles.wrap}>
        {divider === "above" ? dividerRow : null}

        <Button
          label={googleLabel}
          variant="outline"
          size={size}
          disabled={blocked}
          loading={busy === "google"}
          icon={<GoogleGIcon size={18} />}
          onPress={() => void handleGoogle()}
        />

        {appleAvailable ? (
          <Button
            label={appleLabel}
            variant="outline"
            size={size}
            disabled={blocked}
            loading={busy === "apple"}
            icon={<AppleIcon size={18} color={Colors.dark} />}
            onPress={() => void handleApple()}
          />
        ) : null}

        {divider === "below" ? dividerRow : null}
      </View>
      {legalModal}
      {alertModal}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
    gap: 12,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerAbove: {
    marginTop: 14,
    marginBottom: 4,
  },
  dividerBelow: {
    marginTop: 8,
    marginBottom: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E2E2",
  },
  dividerText: {
    color: "#888",
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
  },
});
