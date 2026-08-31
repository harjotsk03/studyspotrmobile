import { useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  Heart,
  LayoutGrid,
  MapPin,
  Star,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

export type OwnProfileMainTabKey =
  | "posts"
  | "reviews"
  | "liked"
  | "spots";
export type PublicProfileMainTabKey = "posts" | "reviews" | "spots";

type OwnProps = {
  variant: "own";
  mainTab: OwnProfileMainTabKey;
  onChangeMain: (tab: OwnProfileMainTabKey) => void;
};

type PublicProps = {
  variant: "public";
  mainTab: PublicProfileMainTabKey;
  onChangeMain: (tab: PublicProfileMainTabKey) => void;
};

type Props = OwnProps | PublicProps;

const OWN_ORDER: OwnProfileMainTabKey[] = [
  "posts",
  "reviews",
  "liked",
  "spots",
];

const PUBLIC_ORDER: PublicProfileMainTabKey[] = ["posts", "reviews", "spots"];

const TAB_GAP = 4;

/** Kept outside the component so a FlatList remount (grid ↔ list) does not
 * reset the slider to the destination tab and skip the spring. */
const slideByVariant: Record<"own" | "public", Animated.Value> = {
  own: new Animated.Value(0),
  public: new Animated.Value(0),
};
const rowWByVariant: Record<"own" | "public", number> = {
  own: 0,
  public: 0,
};

function TabIcon({
  tab,
  selected,
}: {
  tab: OwnProfileMainTabKey | PublicProfileMainTabKey;
  selected: boolean;
}) {
  const color = selected ? Colors.dark : "#9a9a9a";
  const stroke = 2.2;
  switch (tab) {
    case "posts":
      return <LayoutGrid size={22} color={color} strokeWidth={stroke} />;
    case "reviews":
      return <Star size={22} color={color} strokeWidth={stroke} />;
    case "liked":
      return <Heart size={22} color={color} strokeWidth={stroke} />;
    case "spots":
      return <MapPin size={22} color={color} strokeWidth={stroke} />;
    default:
      return null;
  }
}

function tabLabel(key: OwnProfileMainTabKey | PublicProfileMainTabKey) {
  if (key === "posts") return "Posts";
  if (key === "reviews") return "Reviews";
  if (key === "liked") return "Liked";
  return "Spots";
}

export default function ProfileTabsBar(props: Props) {
  const { variant, mainTab, onChangeMain } = props;
  const keys =
    variant === "own"
      ? (OWN_ORDER as (OwnProfileMainTabKey | PublicProfileMainTabKey)[])
      : (PUBLIC_ORDER as (OwnProfileMainTabKey | PublicProfileMainTabKey)[]);

  const index = Math.max(0, keys.indexOf(mainTab));
  const anim = slideByVariant[variant];
  const [rowW, setRowW] = useState(() => rowWByVariant[variant]);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: index,
      useNativeDriver: true,
      friction: 7,
      tension: 72,
    }).start();
  }, [anim, index]);

  const onRowLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (Math.abs(width - rowWByVariant[variant]) < 0.5) return;
    rowWByVariant[variant] = width;
    setRowW(width);
  };

  const n = keys.length;
  const cellW = rowW > 0 ? (rowW - TAB_GAP * (n - 1)) / n : 0;
  const translateX = Animated.multiply(anim, cellW + TAB_GAP);

  return (
    <View style={styles.wrapper}>
      <View style={styles.dividerTop} />
      <View style={styles.row} onLayout={onRowLayout}>
        {cellW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slider,
              {
                width: cellW,
                transform: [{ translateX }],
              },
            ]}
          />
        ) : null}
        {keys.map((key) => {
          const selected = mainTab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={() =>
                variant === "own"
                  ? (onChangeMain as (t: OwnProfileMainTabKey) => void)(
                      key as OwnProfileMainTabKey,
                    )
                  : (onChangeMain as (t: PublicProfileMainTabKey) => void)(
                      key as PublicProfileMainTabKey,
                    )
              }
              style={styles.cell}
            >
              <TabIcon tab={key} selected={selected} />
              <Text
                style={[styles.label, selected && styles.labelSelected]}
                numberOfLines={1}
              >
                {tabLabel(key)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.dividerBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "stretch",
    marginTop: 14,
  },
  dividerTop: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e2e2e2",
  },
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: TAB_GAP,
  },
  slider: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: Colors.dark,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    minWidth: 0,
    zIndex: 1,
  },
  label: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 10,
    color: "#9a9a9a",
  },
  labelSelected: {
    color: Colors.dark,
    fontFamily: Fonts.instrument.semiBold,
  },
  dividerBottom: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e2e2e2",
  },
});
