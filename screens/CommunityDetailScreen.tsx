import { Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, CalendarDays, Info, Share, Users } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import Button from '../components/Button';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export interface CommunityData {
  id: string;
  name: string;
  members: number;
  description: string;
  icon?: string;
  color: string;
  memberAvatars: string[];
}

export type CommunityStackParamList = {
  CommunityList: undefined;
  CommunityDetail: { community: CommunityData };
};

type Props = NativeStackScreenProps<CommunityStackParamList, 'CommunityDetail'>;

export default function CommunityDetailScreen({ route }: Props) {
  const { community } = route.params;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{community.name}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.banner, { backgroundColor: community.color }]}>
          <Text style={styles.bannerInitial}>
            {community.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.name}>{community.name}</Text>
          <Text style={styles.description}>{community.description}</Text>

          {community.memberAvatars.length > 0 && (
            <View style={styles.avatarRow}>
              {community.memberAvatars.slice(0, 5).map((uri, i) => (
                <Image
                  key={i}
                  source={{ uri }}
                  style={[styles.avatar, i > 0 && { marginLeft: -10 }]}
                />
              ))}
              {community.members > 5 && (
                <Text style={styles.moreMembers}>
                  +{(community.members - 5).toLocaleString()} others
                </Text>
              )}
            </View>
          )}

          <View style={styles.actions}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.actionsScroll}
              style={styles.actionsContainer}
            >
              <Pressable style={styles.actionButton}>
                <CalendarDays size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Events</Text>
              </Pressable>
              <Pressable style={styles.actionButton}>
                <Info size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Details</Text>
              </Pressable>
              <Pressable style={styles.actionButton}>
                <Users size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Members</Text>
              </Pressable>
              <Pressable style={styles.actionButton}>
                <Share size={20} color={Colors.dark} strokeWidth={2} />
                <Text style={styles.actionLabel}>Share</Text>
              </Pressable>
            </ScrollView>
            <Button label="Join Community" variant="default" fullWidth />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.sectionBody}>{community.description}</Text>
        </View>

        <View style={[styles.section, { marginBottom: 40 }]}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Text style={styles.emptyState}>No posts yet. Be the first to share something!</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBEBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginHorizontal: 12,
  },
  content: {
    flex: 1,
  },
  banner: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerInitial: {
    fontSize: 64,
    fontFamily: Fonts.gabarito.bold,
    color: 'rgba(255,255,255,0.4)',
  },
  infoSection: {
    padding: 20,
    backgroundColor: '#fff',
  },
  name: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 26,
    color: Colors.dark,
  },
  memberCount: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: '#888',
    marginTop: 4,
    marginBottom: 12,
  },
  description: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#fff',
  },
  moreMembers: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 13,
    color: '#888',
    marginLeft: 8,
  },
  actions: {
    marginTop: 20,
  },
  section: {
    marginTop: 12,
    padding: 20,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 20,
    color: Colors.dark,
    marginBottom: 10,
  },
  sectionBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  emptyState: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  actionsContainer: {
    marginBottom: 16,
  },
  actionsScroll: {
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    width: 70,
    height: 70,
    backgroundColor: '#f9f9f9',
    gap: 4,
  },
  actionLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 10,
    color: Colors.dark,
  },
});
