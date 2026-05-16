import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

export type OwnProfileMainTabKey =
  | "posts"
  | "spots"
  | "reviews"
  | "settings";
export type PublicProfileMainTabKey = "posts" | "spots" | "reviews";
export type PostSubTabKey = "published" | "liked";

type BaseProps = {
  postSub?: PostSubTabKey;
  onChangePostSub?: (sub: PostSubTabKey) => void;
};

type Props =
  | (BaseProps & {
      variant: "own";
      mainTab: OwnProfileMainTabKey;
      onChangeMain: (tab: OwnProfileMainTabKey) => void;
    })
  | (BaseProps & {
      variant: "public";
      mainTab: PublicProfileMainTabKey;
      onChangeMain: (tab: PublicProfileMainTabKey) => void;
    });

const OWN_TABS: { key: OwnProfileMainTabKey; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "spots", label: "Spots" },
  { key: "reviews", label: "Reviews" },
  { key: "settings", label: "Settings" },
];

const PUBLIC_TABS: { key: PublicProfileMainTabKey; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "spots", label: "Spots" },
  { key: "reviews", label: "Reviews" },
];

const POST_SUB: { key: PostSubTabKey; label: string }[] = [
  { key: "published", label: "Published" },
  { key: "liked", label: "Liked" },
];

export default function ProfileTabsBar(props: Props) {
  const { variant, mainTab, onChangeMain, postSub = "published", onChangePostSub } =
    props;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mainScroll}
      >
        {variant === "own"
          ? OWN_TABS.map((t) => {
              const selected = mainTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => onChangeMain(t.key)}
                  style={[styles.tab, selected && styles.tabSelected]}
                >
                  <Text
                    style={[styles.tabText, selected && styles.tabTextSelected]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })
          : PUBLIC_TABS.map((t) => {
              const selected = mainTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => onChangeMain(t.key)}
                  style={[styles.tab, selected && styles.tabSelected]}
                >
                  <Text
                    style={[styles.tabText, selected && styles.tabTextSelected]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
      </ScrollView>

      {mainTab === "posts" && onChangePostSub ? (
        <View style={styles.subRow}>
          {POST_SUB.map((s) => {
            const selected = postSub === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => onChangePostSub(s.key)}
                style={[styles.subTab, selected && styles.subTabSelected]}
              >
                <Text
                  style={[
                    styles.subTabText,
                    selected && styles.subTabTextSelected,
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 20,
    gap: 12,
    alignSelf: "stretch",
  },
  mainScroll: {
    flexGrow: 1,
    gap: 8,
    paddingVertical: 2,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ebebeb",
    marginRight: 8,
  },
  tabSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 14,
    color: Colors.dark,
  },
  tabTextSelected: {
    color: "#fff",
  },
  subRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  subTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#f3f3f3",
  },
  subTabSelected: {
    backgroundColor: "#e8f0ff",
  },
  subTabText: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
    color: "#666",
  },
  subTabTextSelected: {
    color: Colors.primary,
    fontFamily: Fonts.instrument.semiBold,
  },
});
