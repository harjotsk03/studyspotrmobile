import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import Button from './Button';

interface UserCardProps {
  name: string;
  subtext?: string;
  avatar?: ImageSourcePropType | string;
  onFollow?: () => void;
  followed?: boolean;
}

export default function UserCard({
  name,
  subtext = 'You may know',
  avatar,
  onFollow,
  followed = false,
}: UserCardProps) {
  const avatarSource = typeof avatar === 'string' ? { uri: avatar } : avatar;

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {avatarSource ? (
          <Image source={avatarSource} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.subtext} numberOfLines={1}>{subtext}</Text>
        </View>
      </View>

      <Button
        label={followed ? 'Following' : 'Follow'}
        variant={followed ? 'outline' : 'default'}
        size="sm"
        fullWidth={true}
        onPress={onFollow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: 210,
    width: 160,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 17,
    borderWidth: 1,
    borderColor: "#D5D5D5",
  },
  left: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 999,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
  },
  info: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  name: {
    marginTop: 10,
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  subtext: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 11,
    color: "#A8A8A8",
    marginTop: 2,
  },
});
