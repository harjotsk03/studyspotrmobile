import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';

export default function SpotsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Spots</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.dark,
  },
});
