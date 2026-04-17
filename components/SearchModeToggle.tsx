import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import type { SearchMode } from "../context/SearchStateContext";

type SearchModeToggleProps = {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
};

export default function SearchModeToggle({
  value,
  onChange,
}: SearchModeToggleProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const thumbWidth = useMemo(() => {
    if (containerWidth <= 8) {
      return 0;
    }

    return (containerWidth - 8) / 2;
  }, [containerWidth]);

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: value === "users" ? 0 : thumbWidth,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    }).start();
  }, [thumbWidth, translateX, value]);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {thumbWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activePill,
            {
              width: thumbWidth,
              transform: [{ translateX }],
            },
          ]}
        />
      ) : null}

      <Pressable style={styles.toggleButton} onPress={() => onChange("users")}>
        <Text style={[styles.toggleLabel, value === "users" && styles.activeText]}>
          Users
        </Text>
      </Pressable>

      <Pressable
        style={styles.toggleButton}
        onPress={() => onChange("communities")}
      >
        <Text
          style={[
            styles.toggleLabel,
            value === "communities" && styles.activeText,
          ]}
        >
          Communities
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    padding: 4,
    overflow: "hidden",
  },
  activePill: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  toggleButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  toggleLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 16,
    color: Colors.dark,
  },
  activeText: {
    color: "#fff",
  },
});
