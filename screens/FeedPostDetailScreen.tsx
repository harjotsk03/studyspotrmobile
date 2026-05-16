import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FeedPostCard from "../components/FeedPostCard";
import { Colors } from "../constants/Colors";
import { useAuth } from "../context/AuthContext";
import type { FeedPost } from "../utils/feedApi";

export type FeedPostDetailParams = { post: FeedPost };

type Props = NativeStackScreenProps<
  { FeedPostDetail: FeedPostDetailParams },
  "FeedPostDetail"
>;

export default function FeedPostDetailScreen({ navigation, route }: Props) {
  const { post } = route.params;
  const { token, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const currentUserId = profile?.userProfile?.id ?? null;

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <FeedPostCard
          post={post}
          token={token}
          currentUserId={currentUserId}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 2,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  scrollContent: {
    paddingBottom: 32,
  },
});
