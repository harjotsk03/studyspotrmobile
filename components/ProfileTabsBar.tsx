import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Heart,
  LayoutGrid,
  MapPin,
  Settings,
  Star,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

export type OwnProfileMainTabKey =
  | "posts"
  | "reviews"
  | "liked"
  | "settings"
  | "spots";
export type PublicProfileMainTabKey =
  | "posts"
  | "reviews"
  | "liked"
  | "spots";

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
  "settings",
  "spots",
];

const PUBLIC_ORDER: PublicProfileMainTabKey[] = [
  "posts",
  "reviews",
  "liked",
  "spots",
];

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
    case "settings":
      return <Settings size={22} color={color} strokeWidth={stroke} />;
    case "spots":
      return <MapPin size={22} color={color} strokeWidth={stroke} />;
    default:
      return null;
  }
}

export default function ProfileTabsBar(props: Props) {
  const { variant, mainTab, onChangeMain } = props;
  const keys =
    variant === "own"
      ? (OWN_ORDER as (OwnProfileMainTabKey | PublicProfileMainTabKey)[])
      : (PUBLIC_ORDER as (OwnProfileMainTabKey | PublicProfileMainTabKey)[]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.dividerTop} />
      <View style={styles.row}>
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
              style={[styles.cell, selected && styles.cellSelected]}
            >
              <TabIcon tab={key} selected={selected} />
              <Text
                style={[styles.label, selected && styles.labelSelected]}
                numberOfLines={1}
              >
                {key === "posts"
                  ? "Posts"
                  : key === "reviews"
                    ? "Reviews"
                    : key === "liked"
                      ? "Liked"
                      : key === "settings"
                        ? "Settings"
                        : "Spots"}
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
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 4,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    minWidth: 0,
  },
  cellSelected: {
    borderBottomColor: Colors.dark,
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
