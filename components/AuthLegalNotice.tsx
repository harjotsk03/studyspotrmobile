import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useLegalConsent } from "../hooks/useLegalConsent";

type Props = {
  style?: StyleProp<TextStyle>;
};

export default function AuthLegalNotice({ style }: Props) {
  const { modal, openDocument } = useLegalConsent();

  return (
    <>
      <Text style={[styles.text, style]}>
        By continuing, you agree to our{" "}
        <Text style={styles.link} onPress={() => openDocument("terms")}>
          Terms of Service
        </Text>{" "}
        and{" "}
        <Text style={styles.link} onPress={() => openDocument("privacy")}>
          Privacy Policy
        </Text>
        .
      </Text>
      {modal}
    </>
  );
}

const styles = StyleSheet.create({
  text: {
    color: "#888",
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  link: {
    color: Colors.dark,
    fontFamily: Fonts.instrument.medium,
    textDecorationLine: "underline",
  },
});
