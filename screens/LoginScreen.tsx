import { useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Colors } from "../constants/Colors";
import { API_BASE_URL } from "../constants/Api";
import {
  loadRememberMePreference,
  persistRememberMePreference,
  useAuth,
} from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Fonts } from "../constants/Fonts";
import Button from "../components/Button";
import Input from "../components/Input";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAppAlert } from "../components/AppAlertModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Circle, CircleCheck, Eye, EyeOff } from "lucide-react-native";

import type { AuthStackParamList } from "../types/navigation";

export default function LoginScreen() {
  const { login } = useAuth();
  const { showAlert, modal: alertModal } = useAppAlert();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    void loadRememberMePreference().then(setRememberMe);
  }, []);

  const toggleRememberMe = () => {
    setRememberMe((current) => {
      const next = !current;
      void persistRememberMePreference(next);
      return next;
    });
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert("Almost there", "Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showAlert("Login failed", data.error || "Something went wrong.");
        return;
      }

      await login(
        data.user,
        data.access_token,
        data.refresh_token,
        rememberMe,
      );
    } catch {
      showAlert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Button
            size="icon"
            variant="secondary"
            icon={<ArrowLeft size={20} color={Colors.dark} strokeWidth={2.4} />}
            onPress={() => navigation.navigate("WelcomeScreen")}
          />
        </View>
        <View style={styles.inner}>
          <View style={styles.content}>
            <Text style={styles.title}>Welcome Back!</Text>
            <Text style={styles.subtitle}>
              Sign in to your account to continue
            </Text>

            <Input
              label="Email"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              containerStyle={styles.fieldGap}
            />
            <Input
              label="Password"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              rightIcon={
                <TouchableOpacity
                  accessibilityLabel={
                    showPassword ? "Hide password" : "Show password"
                  }
                  accessibilityRole="button"
                  activeOpacity={0.7}
                  onPress={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? (
                    <EyeOff size={18} color="#999" />
                  ) : (
                    <Eye size={18} color="#999" />
                  )}
                </TouchableOpacity>
              }
              containerStyle={styles.fieldGap}
            />

            <View style={styles.actionsRow}>
              <Pressable
                style={styles.rememberMeButton}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
                onPress={toggleRememberMe}
              >
                <View>
                  {rememberMe ? (
                    <CircleCheck size={18} color={Colors.accent} />
                  ) : (
                    <Circle size={18} color={Colors.dark} />
                  )}
                </View>
                <Text style={styles.rememberMeText}>Remember me</Text>
              </Pressable>

              <TouchableOpacity
                style={styles.forgotPasswordButton}
                onPress={() => navigation.navigate("ForgotPasswordScreen")}
              >
                <Text style={styles.forgotPasswordText}>
                  Forgot your password?
                </Text>
              </TouchableOpacity>
            </View>

            <Button
              label="Log In"
              variant="default"
              loading={loading}
              style={styles.loginButton}
              onPress={handleLogin}
            />

            <SocialAuthButtons
              disabled={loading}
              intent="signin"
              rememberMe={rememberMe}
              divider="above"
              dividerLabel="or"
            />
          </View>

          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => navigation.navigate("SignupMethodScreen")}
          >
            <Text style={styles.registerText}>
              Don't have an account?{" "}
              <Text style={styles.registerTextLink}>Register</Text>
            </Text>
          </TouchableOpacity>
        </View>
        {alertModal}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  headerRow: {
    paddingHorizontal: 22,
    marginBottom: 12,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 36,
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
    fontSize: 16,
    fontFamily: Fonts.instrument.regular,
    color: "#666",
    marginBottom: 10,
  },
  registerButton: {
    marginTop: "auto",
    marginBottom: 20,
    alignItems: "center",
  },
  registerText: {
    color: Colors.dark,
    fontSize: 16,
    fontFamily: Fonts.gabarito.regular,
    textAlign: "center",
  },
  loginButton: {
    marginTop: 24,
    marginBottom: 8,
  },
  fieldGap: {
    marginTop: 16,
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  registerTextLink: {
    color: Colors.accent,
    fontFamily: Fonts.gabarito.medium,
  },
  rememberMeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rememberMeText: {
    color: Colors.dark,
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
  },
  forgotPasswordButton: {
    alignItems: "flex-end",
  },
  forgotPasswordText: {
    color: Colors.dark,
    fontFamily: Fonts.instrument.medium,
    fontSize: 12,
  },
});
