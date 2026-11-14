import { Image, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import StudySpotrLogo from "../assets/studyspotrlogo.svg";
import { Fonts } from "../constants/Fonts";
import Button from "../components/Button";
import type { AuthStackParamList } from "../types/navigation";

const LOGO_SIZE = 60;
const BACKGROUND = require("../assets/initialscreenimage.jpg");

export default function WelcomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Image source={BACKGROUND} style={styles.bg} resizeMode="cover" />

      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.1)", "rgba(0,0,0,0.65)"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.brand}>
        <StudySpotrLogo width={LOGO_SIZE} height={LOGO_SIZE} color="#fff" />
        <Text style={styles.tagline}>A place to find your people</Text>
      </View>

      <View style={styles.actions}>
        <Button
          label="Sign Up"
          variant="default"
          size="lg"
          fullWidth
          onPress={() => navigation.navigate("SignupMethodScreen")}
        />
        <Button
          label="Log In"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => navigation.navigate("LoginScreen")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a2a1c",
  },
  bg: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  brand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 200,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  tagline: {
    marginTop: 12,
    color: "#fff",
    fontFamily: Fonts.gabarito.regular,
    fontSize: 15,
    letterSpacing: 0.8,
    textAlign: "center",
  },
  actions: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 130,
    gap: 14,
  },
});
