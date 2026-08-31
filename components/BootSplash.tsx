import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import StudySpotrLogo from "../assets/studyspotrlogo.svg";
import { Colors } from "../constants/Colors";

const LOGO_SIZE = 72;
const FADE_IN_MS = 2500;
const FADE_OUT_MS = 560;

type Props = {
  /** Session/fonts are ready — splash can dismiss after the fade-in. */
  ready?: boolean;
  onFinished?: () => void;
};

/** White load screen: black logo fades in over 2.5s, then the overlay lifts. */
export default function BootSplash({ ready = false, onFinished }: Props) {
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const readyRef = useRef(ready);
  const introDoneRef = useRef(false);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  readyRef.current = ready;
  onFinishedRef.current = onFinished;

  const dismiss = useCallback(() => {
    if (finishedRef.current || !readyRef.current || !introDoneRef.current) {
      return;
    }
    finishedRef.current = true;

    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onFinishedRef.current?.();
      }
    });
  }, [overlayOpacity]);

  useEffect(() => {
    Animated.timing(logoOpacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      introDoneRef.current = true;
      dismiss();
    });
  }, [dismiss, logoOpacity]);

  useEffect(() => {
    if (ready) {
      dismiss();
    }
  }, [dismiss, ready]);

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.overlay, { opacity: overlayOpacity }]}
    >
      <StatusBar style="dark" />
      <Animated.View style={{ opacity: logoOpacity }}>
        <StudySpotrLogo
          width={LOGO_SIZE}
          height={LOGO_SIZE}
          color={Colors.dark}
          fill={Colors.dark}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 200,
  },
});
