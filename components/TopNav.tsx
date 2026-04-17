import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Bell } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Fonts } from '../constants/Fonts';
import { Colors } from '../constants/Colors';

const AVATAR_COLORS = [
  '#E84393', '#6C5CE7', '#00B894', '#FDCB6E',
  '#FF7675', '#0984E3', '#A0522D', '#00CEC9',
  '#D63031', '#E17055', '#636E72', '#2D3436',
];

function getColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface TopNavProps {
  onNotificationPress?: () => void;
  onProfilePress?: () => void;
}

export default function TopNav({ onNotificationPress, onProfilePress }: TopNavProps) {
  const { profile } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();


  const firstName = profile?.userProfile?.first_name ?? '';
  const initial = firstName.charAt(0).toUpperCase();
  const avatarColor = getColorForName(firstName || 'U');
  const profileImage = profile?.userProfile?.profile_photo as
    | string
    | undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onNotificationPress}
        activeOpacity={0.7}
      >
        <Bell size={22} color={Colors.dark} strokeWidth={2} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.avatarButton}
        onPress={onProfilePress ?? (() => navigation.navigate('Profile'))}
        activeOpacity={0.7}
      >
        {profileImage ? (
          <Image source={{ uri: profileImage }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: Colors.light,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBEBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontFamily: Fonts.gabarito.semiBold,
    color: '#FFFFFF',
  },
});
