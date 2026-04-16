import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import UserCard from '../components/UserCard';
import TopNav from '../components/TopNav';

const PEOPLE = [
  { id: '1', name: 'Jane Smith', avatar: 'https://i.pravatar.cc/150?u=jane' },
  { id: '2', name: 'Alex Chen', avatar: 'https://i.pravatar.cc/150?u=alex' },
  { id: '3', name: 'Maria Lopez', avatar: 'https://i.pravatar.cc/150?u=maria' },
  { id: '4', name: 'David Kim', avatar: 'https://i.pravatar.cc/150?u=david' },
  { id: '5', name: 'Sarah Patel', avatar: 'https://i.pravatar.cc/150?u=sarah' },
  { id: '6', name: 'James Wilson', avatar: 'https://i.pravatar.cc/150?u=james' },
  { id: '7', name: 'Emily Brown', avatar: 'https://i.pravatar.cc/150?u=emily' },
  { id: '8', name: 'Omar Hassan', avatar: 'https://i.pravatar.cc/150?u=omar' },
  { id: '9', name: 'Lily Zhang', avatar: 'https://i.pravatar.cc/150?u=lily' },
  { id: '10', name: 'Ryan Taylor', avatar: 'https://i.pravatar.cc/150?u=ryan' },
];

export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <TopNav />
      <Text style={styles.title}>Feed</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {PEOPLE.map((person) => (
          <View key={person.id} style={styles.cardWrapper}>
            <UserCard
              name={person.name}
              subtext="You may know"
              avatar={person.avatar}
              onFollow={() => console.log('followed', person.name)}
            />
          </View>
        ))}
      </ScrollView>
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
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 2,
  },
  cardWrapper: {
    width: 168,
  },
});
