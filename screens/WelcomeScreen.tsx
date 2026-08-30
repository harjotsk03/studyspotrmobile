import { Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import StudySpotrLogo from "../assets/studyspotrlogo.svg";
import Button from "../components/Button";
import FadeInUp from "../components/FadeInUp";
import { Fonts } from "../constants/Fonts";
import type { AuthStackParamList } from "../types/navigation";

const LOGO_SIZE = 64;
const BACKGROUND = require("../assets/initialscreenimage.jpg");

export default function WelcomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        source={BACKGROUND}
        style={styles.background}
        resizeMode="cover"
      />
      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(12, 18, 14, 0.28)",
          "rgba(12, 18, 14, 0.08)",
          "rgba(12, 18, 14, 0.52)",
        ]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />

      <FadeInUp style={styles.brandWrap}>
        <View style={[styles.brand, { paddingTop: insets.top + 36 }]}>
          <StudySpotrLogo
            width={LOGO_SIZE}
            height={LOGO_SIZE}
            color="#fff"
          />
          <Text style={styles.tagline}>A place to find your people</Text>
        </View>
      </FadeInUp>

      <FadeInUp
        delay={90}
        style={[
          styles.actions,
          { paddingBottom: Math.max(insets.bottom, 16) + 10 },
        ]}
      >
        <Button
          label="Sign Up"
          variant="default"
          onPress={() => navigation.navigate("SignupMethodScreen")}
        />
        <Button
          label="Log In"
          variant="secondary"
          onPress={() => navigation.navigate("LoginScreen")}
        />
      </FadeInUp>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a2a1c",
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  brandWrap: {
    flex: 1,
  },
  brand: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    marginTop: -48,
  },
  tagline: {
    marginTop: 12,
    color: "#fff",
    fontFamily: Fonts.gabarito.regular,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.8,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  actions: {
    zIndex: 2,
    overflow: "visible",
    paddingHorizontal: 28,
    gap: 12,
  },
});
