import { Image, Pressable, StyleSheet, View } from "react-native";
import { Play } from "lucide-react-native";
import type { FeedPost } from "../utils/feedApi";
import { feedPostGridCover } from "../utils/feedApi";

type Props = {
  post: FeedPost;
  onPress: () => void;
};

export default function ProfilePostGridTile({ post, onPress }: Props) {
  const { uri, isVideo } = feedPostGridCover(post);

  return (
    <Pressable
      style={styles.wrap}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open post"
    >
      {uri ? (
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.placeholder]} />
      )}
      {isVideo ? (
        <View style={styles.playBadge} pointerEvents="none">
          <Play size={13} color="#fff" fill="#fff" strokeWidth={2} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    aspectRatio: 0.78,
    maxWidth: "33.333%",
    padding: 1,
  },
  image: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#e8e8e8",
  },
  placeholder: {
    backgroundColor: "#ddd",
  },
  playBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    padding: 5,
  },
});
