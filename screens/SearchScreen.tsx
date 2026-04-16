import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import TopNav from '../components/TopNav';

export default function SearchScreen() {
  return (
    <View style={styles.container}>
      <TopNav />
      <Text style={styles.title}>Search</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.dark,
    paddingHorizontal: 20,
  },
});
