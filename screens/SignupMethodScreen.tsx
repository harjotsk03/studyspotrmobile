import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Mail } from "lucide-react-native";
import StudySpotrLogo from "../assets/studyspotrlogo.svg";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import Button from "../components/Button";
import FadeInUp from "../components/FadeInUp";
import SocialAuthButtons from "../components/SocialAuthButtons";
import type { AuthStackParamList } from "../types/navigation";

const LOGO_SIZE = 44;

export default function SignupMethodScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <Button
          size="icon"
          variant="secondary"
          icon={<ArrowLeft size={20} color={Colors.dark} strokeWidth={2.4} />}
          onPress={() => navigation.navigate("WelcomeScreen")}
        />
        <StudySpotrLogo
          width={LOGO_SIZE}
          height={LOGO_SIZE}
          color={Colors.primary}
        />
        <View style={styles.headerSpacer} />
      </View>

      <FadeInUp style={styles.content}>
        <Text style={styles.title}>Join StudySpotr</Text>
        <Text style={styles.subtitle}>How do you want to sign up?</Text>

        <Button
          label="Continue with email"
          variant="default"
          size="lg"
          icon={<Mail size={18} color="#fff" />}
          onPress={() => navigation.navigate("RegisterScreen")}
          style={styles.emailButton}
        />

        <SocialAuthButtons
          intent="signup"
          size="lg"
          divider="above"
          dividerLabel="or"
        />
      </FadeInUp>

      <TouchableOpacity
        style={[
          styles.loginLink,
          { marginBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
        onPress={() => navigation.navigate("LoginScreen")}
      >
        <Text style={styles.loginLinkText}>
          Already have an account?{" "}
          <Text style={styles.loginLinkTextAccent}>Log in</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
    paddingHorizontal: 22,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  content: {
    flex: 1,
    paddingHorizontal: 6,
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
    marginBottom: 28,
  },
  emailButton: {
    marginBottom: 4,
  },
  loginLink: {
    alignItems: "center",
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
