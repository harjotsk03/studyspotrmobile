import { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../constants/Colors";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Fonts } from "../constants/Fonts";
import Button from "../components/Button";
import Input from "../components/Input";

type AuthStackParamList = {
  LoginScreen: undefined;
  RegisterScreen: undefined;
  ForgotPasswordScreen: undefined;
};

export default function LoginScreen() {
  const { login } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password.");
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
        Alert.alert("Login failed", data.error || "Something went wrong.");
        return;
      }

      await login(data.user, data.access_token, data.refresh_token);
      Alert.alert("Welcome", `${data.user.userProfile.first_name} ${data.user.userProfile.last_name}!`);
    } catch {
      Alert.alert("Network error", "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
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
            secureTextEntry
            autoComplete="password"
            containerStyle={styles.fieldGap}
          />

          <TouchableOpacity
            style={styles.forgotPasswordButton}
            onPress={() => navigation.navigate("ForgotPasswordScreen")}
          >
            <Text style={styles.forgotPasswordText}>Forgot your password?</Text>
          </TouchableOpacity>

          <Button
            label="Log In"
            variant="default"
            loading={loading}
            style={styles.loginButton}
            onPress={handleLogin}
          />
        </View>

        <TouchableOpacity
          style={styles.footer}
          onPress={() => navigation.navigate("RegisterScreen")}
        >
          <Text style={styles.registerText}>
            Don't have an account? <Text style={styles.registerTextLink}>Register</Text>
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingTop: 130,
    paddingBottom: 36,
  },
  content: {
    width: "100%",
  },
  footer: {
    marginTop: "auto",
    marginBottom: 20,
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
  registerText: {
    color: Colors.dark,
    fontSize: 16,
    fontFamily: Fonts.gabarito.regular,
    textAlign: "center",
  },
  loginButton: {
    marginTop: 24,
  },
  fieldGap: {
    marginTop: 16,
  },
  registerTextLink: {
    color: Colors.accent,
    fontFamily: Fonts.gabarito.medium,
  },
  forgotPasswordButton: {
    marginTop: 16,
    width: "100%",
    alignItems: "flex-end",
  },
  forgotPasswordText: {
    color: Colors.dark,
    fontFamily: Fonts.instrument.medium,
    fontSize: 12,
  },
});
