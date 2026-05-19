import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import type { UserProfile } from "../context/AuthContext";

function welcomeLabelFromProfile(profile: UserProfile | null): {
  name: string;
  hasName: boolean;
} {
  const u = profile?.userProfile;
  if (!u) return { name: "", hasName: false };

  const full = [u.first_name, u.last_name]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ");

  const rawUser =
    typeof u.username === "string" && u.username.trim()
      ? u.username.trim().replace(/^@/, "")
      : "";

  const name = full || rawUser;
  return { name, hasName: name.length > 0 };
}

/** Matches tab bar height in App.tsx (~88 including label area). */
const TAB_BAR_OFFSET = 88;
const OFFSCREEN_TRANSLATE = 72;
const SLIDE_MS = 280;
const HOLD_MS = 3000;

/**
 * Slide-up toast just above the bottom tab bar, shown after login/register only.
 */
export default function LoginWelcomeToast() {
  const { welcomeToastNonce, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { name, hasName } = useMemo(
    () => welcomeLabelFromProfile(profile),
    [profile],
  );
  const translateY = useRef(
    new Animated.Value(OFFSCREEN_TRANSLATE),
  ).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (welcomeToastNonce === 0) return;

    translateY.setValue(OFFSCREEN_TRANSLATE);
    opacity.setValue(0);

    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: SLIDE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: SLIDE_MS * 0.6,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(HOLD_MS),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: OFFSCREEN_TRANSLATE,
          duration: SLIDE_MS * 0.85,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: SLIDE_MS * 0.85,
          useNativeDriver: true,
        }),
      ]),
    ]);

    anim.start();
    return () => {
      anim.stop();
    };
  }, [welcomeToastNonce, opacity, translateY]);

  const bottom = TAB_BAR_OFFSET + Math.max(insets.bottom - 10, 0);

  return (
    <View
      style={[styles.overlay, { bottom }]}
      pointerEvents="none"
      accessibilityElementsHidden
    >
      <Animated.View
        style={[
          styles.card,
          { transform: [{ translateY }], opacity },
        ]}
      >
        <View style={styles.cardInner}>
          {hasName ? (
            <Text style={styles.line} numberOfLines={2}>
              <Text style={styles.welcomeLead}>Welcome back, </Text>
              <Text style={styles.nameHighlight}>{name}</Text>
              <Text style={styles.welcomeTail}>!</Text>
            </Text>
          ) : (
            <Text style={styles.line}>
              <Text style={styles.welcomeLead}>Welcome back</Text>
              <Text style={styles.welcomeTail}>!</Text>
            </Text>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  card: {
    borderRadius: 16,
    maxWidth: "88%",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Colors.primary,
    borderWidth: 0,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  accentStripe: {
    width: 5,
    backgroundColor: Colors.accent,
  },
  cardInner: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingLeft: 14,
  },
  line: {
    fontFamily: Fonts.gabarito.regular,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
  welcomeLead: {
    color: "#fff",
    fontFamily: Fonts.gabarito.regular,
    fontSize: 16,
  },
  nameHighlight: {
    color: "#fff",
    fontFamily: Fonts.gabarito.regular,
    fontSize: 16,
  },
  welcomeTail: {
    color: "#fff",
    fontFamily: Fonts.gabarito.regular,
    fontSize: 16,
  },
});
