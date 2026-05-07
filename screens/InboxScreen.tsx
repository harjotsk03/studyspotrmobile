import { StyleSheet, Text, View } from "react-native";
import TopNav from "../components/TopNav";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

export default function InboxScreen() {
  return (
    <View style={styles.container}>
      <TopNav />
      <View style={styles.content}>
        <Text style={styles.title}>Inbox</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyText}>
            Conversations and updates will show up here.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 32,
    color: Colors.dark,
    marginBottom: 16,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
  },
  emptyTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginBottom: 6,
  },
  emptyText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
});
