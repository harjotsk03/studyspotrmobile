import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import Button from '../components/Button';
import CommunityCard from '../components/CommunityCard';
import TopNav from '../components/TopNav';
import type { CommunityStackParamList } from './CommunityDetailScreen';

const COMMUNITIES = [
  {
    id: '1',
    name: 'Sikhs in Tech Canada',
    members: 342,
    description: 'A community for Sikh students in tech across Canada. Resources, mentorship...',
    color: '#FF9900',
    memberAvatars: [
      'https://i.pravatar.cc/100?u=m1',
      'https://i.pravatar.cc/100?u=m2',
      'https://i.pravatar.cc/100?u=m3',
    ],
  },
  {
    id: '2',
    name: 'UBC Study Group',
    members: 1204,
    description: 'Find study partners, share notes, and ace your exams together at UBC.',
    color: '#1A61A8',
    memberAvatars: [
      'https://i.pravatar.cc/100?u=m4',
      'https://i.pravatar.cc/100?u=m5',
      'https://i.pravatar.cc/100?u=m6',
    ],
  },
  {
    id: '3',
    name: 'Women in STEM YVR',
    members: 578,
    description: 'Empowering women in science, technology, engineering, and math in Vancouver.',
    color: '#E84393',
    memberAvatars: [
      'https://i.pravatar.cc/100?u=m7',
      'https://i.pravatar.cc/100?u=m8',
      'https://i.pravatar.cc/100?u=m9',
    ],
  },
  {
    id: '4',
    name: 'Toronto Tech Meetups',
    members: 2310,
    description: 'Weekly meetups for developers, designers, and founders across the GTA.',
    color: '#6C5CE7',
    memberAvatars: [
      'https://i.pravatar.cc/100?u=m10',
      'https://i.pravatar.cc/100?u=m11',
      'https://i.pravatar.cc/100?u=m12',
    ],
  },
  {
    id: '5',
    name: 'Coffee & Code',
    members: 189,
    description: 'Casual co-working sessions at local cafés. Bring your laptop and good vibes.',
    color: '#A0522D',
    memberAvatars: [
      'https://i.pravatar.cc/100?u=m13',
      'https://i.pravatar.cc/100?u=m14',
      'https://i.pravatar.cc/100?u=m15',
    ],
  },
  {
    id: '6',
    name: 'Design Systems Club',
    members: 445,
    description: 'Discuss design tokens, component libraries, and building scalable UI systems.',
    color: '#00B894',
    memberAvatars: [
      'https://i.pravatar.cc/100?u=m16',
      'https://i.pravatar.cc/100?u=m17',
      'https://i.pravatar.cc/100?u=m18',
    ],
  },
  {
    id: '7',
    name: 'ML Paper Reading',
    members: 267,
    description: 'Bi-weekly deep dives into the latest machine learning research papers.',
    color: '#191919',
    memberAvatars: [
      'https://i.pravatar.cc/100?u=m19',
      'https://i.pravatar.cc/100?u=m20',
      'https://i.pravatar.cc/100?u=m21',
    ],
  },
  {
    id: '8',
    name: 'Startup Founders YVR',
    members: 831,
    description: 'Connect with fellow founders, share wins, and get honest feedback.',
    color: '#FDCB6E',
    memberAvatars: [
      'https://i.pravatar.cc/100?u=m22',
      'https://i.pravatar.cc/100?u=m23',
      'https://i.pravatar.cc/100?u=m24',
    ],
  },
];

export default function CommunityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();

  return (
    <View style={styles.container}>
      <TopNav />
      <ScrollView showsVerticalScrollIndicator={false}>
        <Image
          source={require('../assets/communityheader.png')}
          style={styles.headerImage}
          resizeMode="cover"
        />
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Create Your Own Community</Text>
          <Text style={styles.subtitle}>
            Host events, share posts, meet new people and connect!
          </Text>
          <Button label="Create a Community" variant="accent" onPress={() => {}} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>Upcoming Events</Text>
          <Text style={styles.subtitle}>
            Find networking, studying, or career progression events near you and
            find a community to help push you forward.
          </Text>
          <Button label="Browse Events" variant="default" onPress={() => {}} />
        </View>

        <View style={styles.communitiesContainer}>
          <Text style={styles.sectionTitle}>Popular Communities Near You</Text>
          {COMMUNITIES.map((community) => (
            <CommunityCard
              key={community.id}
              name={community.name}
              members={community.members}
              description={community.description}
              color={community.color}
              memberAvatars={community.memberAvatars}
              onPress={() => navigation.navigate('CommunityDetail', { community })}
            />
          ))}
        </View>
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
  titleContainer: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
  },
  headerImage: {
    width: '100%',
    height: 124,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.gabarito.medium,
    color: Colors.dark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.instrument.regular,
    color: Colors.dark,
    marginBottom: 20,
  },
  communitiesContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: Fonts.gabarito.semiBold,
    color: Colors.dark,
    marginBottom: 14,
  },
});
