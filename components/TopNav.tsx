import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';

export default function TopNav() {
  const insets = useSafeAreaInsets();

  return <View style={[styles.container, { paddingTop: insets.top }]} />;
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: Colors.light,
  },
});
