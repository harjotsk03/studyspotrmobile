import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import StudySpotrLogo from "../assets/studyspotrlogo.svg";
import { Colors } from "../constants/Colors";

const LOGO_SIZE = 132;
const START_SCALE = 18;
const SHRINK_MS = 1200;
const FADE_OUT_MS = 560;

type Props = {
  /** Session/fonts are ready — splash can dismiss after the shrink. */
  ready?: boolean;
  onFinished?: () => void;
};

/**
 * Full-screen launch animation: oversized white pin shrinks into place,
 * then the blue field and logo fade away together.
 */
export default function BootSplash({ ready = false, onFinished }: Props) {
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(START_SCALE)).current;
  const readyRef = useRef(ready);
  const shrinkDoneRef = useRef(false);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  readyRef.current = ready;
  onFinishedRef.current = onFinished;

  const dismiss = useCallback(() => {
    if (finishedRef.current || !readyRef.current || !shrinkDoneRef.current) {
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
    Animated.timing(logoScale, {
      toValue: 1,
      duration: SHRINK_MS,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      shrinkDoneRef.current = true;
      dismiss();
    });
  }, [dismiss, logoScale]);

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
      <Animated.View style={{ transform: [{ scale: logoScale }] }}>
        <StudySpotrLogo
          width={LOGO_SIZE}
          height={LOGO_SIZE}
          color="#FFFFFF"
          fill="#FFFFFF"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 200,
  },
});
