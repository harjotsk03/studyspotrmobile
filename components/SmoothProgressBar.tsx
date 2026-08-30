import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Colors } from "../constants/Colors";

type Props = {
  progress: number;
};

export default function SmoothProgressBar({ progress }: Props) {
  const anim = useRef(new Animated.Value(Math.max(0, Math.min(1, progress)))).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [anim, progress]);

  const width = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
});
