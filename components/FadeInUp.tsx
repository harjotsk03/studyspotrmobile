import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  children: ReactNode;
  replayKey?: string | number;
  style?: StyleProp<ViewStyle>;
  delay?: number;
};

export default function FadeInUp({
  children,
  replayKey = 0,
  style,
  delay = 0,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(18);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 480,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 480,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, replayKey, translateY]);

  return (
    <Animated.View
      style={[styles.wrap, style, { opacity, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
});
