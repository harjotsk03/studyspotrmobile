import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type SkeletonBoxProps = {
  width?: ViewStyle["width"];
  height?: ViewStyle["height"];
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBox({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.box,
        { width, height, borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SkeletonRow({
  avatarSize = 48,
  lines = 2,
  actions = false,
}: {
  avatarSize?: number;
  lines?: number;
  actions?: boolean;
}) {
  return (
    <SkeletonCard style={styles.rowCard}>
      <SkeletonBox width={avatarSize} height={avatarSize} radius={avatarSize / 2} />
      <View style={styles.rowCopy}>
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonBox
            key={index}
            width={index === 0 ? "70%" : "48%"}
            height={index === 0 ? 16 : 13}
            radius={7}
          />
        ))}
      </View>
      {actions && <SkeletonBox width={80} height={30} radius={10} />}
    </SkeletonCard>
  );
}

export function SkeletonList({
  count = 4,
  row,
  style,
}: {
  count?: number;
  row?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.list, style]}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index}>{row ?? <SkeletonRow />}</View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: "#E7E7E7",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
  },
  list: {
    gap: 12,
  },
  rowCard: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  rowCopy: {
    flex: 1,
    gap: 8,
  },
});
