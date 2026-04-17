import { StyleSheet, Text, View } from "react-native";
import { Colors } from "../../constants/Colors";
import Input from "../Input";
import { Search } from "lucide-react-native";
import { useState } from "react";

export default function CommunitiesSearch() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Input onChangeText={() => {}} icon={<Search size={16} color={Colors.dark} />} iconPosition="left" placeholder="Search for communities..." />
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
    paddingHorizontal: 20,
    marginTop: 6,
  },
});
