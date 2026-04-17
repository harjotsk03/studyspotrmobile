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
  requested?: boolean;
  loading?: boolean;
}

export default function UserCard({
  name,
  subtext = 'You may know',
  avatar,
  onFollow,
  followed = false,
  requested = false,
  loading = false,
}: UserCardProps) {
  const avatarSource = typeof avatar === 'string' ? { uri: avatar } : avatar;
  const buttonLabel = requested
    ? 'Requested'
    : followed
      ? 'Remove Friend'
      : 'Add Friend';
  const buttonVariant = requested || followed ? 'secondary' : 'default';

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {avatarSource ? (
          <Image source={avatarSource} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.subtext} numberOfLines={1}>
            {subtext}
          </Text>
        </View>
      </View>

      <Button
        label={buttonLabel}
        variant={buttonVariant}
        size="sm"
        fullWidth={true}
        disabled={requested}
        loading={loading}
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
    padding: 14,
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
    textTransform: "capitalize",
    marginTop: 10,
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  subtext: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 11,
    color: "#A8A8A8",
    marginTop: 2,
  },
});
