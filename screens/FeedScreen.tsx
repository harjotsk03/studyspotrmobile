import { StyleSheet, Text, View } from "react-native";
import SuggestedUsers from "../components/SuggestedUsers";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import TopNav from "../components/TopNav";
import { useAuth } from "../context/AuthContext";

export default function FeedScreen() {
  const { profile } = useAuth();
  return (
    <View style={styles.container}>
      <TopNav />
      <Text style={styles.title}>Feed</Text>
      <SuggestedUsers />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
    paddingTop: 0,
  },
  title: {
    fontSize: 32,
    fontFamily: Fonts.gabarito.bold,
    color: Colors.dark,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
});
