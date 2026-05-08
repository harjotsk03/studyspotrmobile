import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import Button from "./Button";
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

interface UserCardProps {
  name: string;
  subtext?: string;
  avatarKey?: string;
  avatar?: ImageSourcePropType | string;
  onFollow?: () => void;
  onProfilePress?: () => void;
  followed?: boolean;
  requested?: boolean;
  loading?: boolean;
}

export default function UserCard({
  name,
  subtext = "You may know",
  avatarKey,
  avatar,
  onFollow,
  onProfilePress,
  followed = false,
  requested = false,
  loading = false,
}: UserCardProps) {
  const avatarSource = typeof avatar === "string" ? { uri: avatar } : avatar;
  const avatarUser = { id: avatarKey, name };
  const buttonLabel = requested
    ? "Requested"
    : followed
      ? "Remove Friend"
      : "Add Friend";
  const buttonVariant = requested || followed ? "secondary" : "default";

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.left}
        onPress={onProfilePress}
        disabled={!onProfilePress}
      >
        {avatarSource ? (
          <Image source={avatarSource} style={styles.avatar} />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.avatarPlaceholder,
              { backgroundColor: getUserAvatarColor(avatarUser) },
            ]}
          >
            <Text style={styles.avatarInitial}>
              {getUserInitials(avatarUser)}
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
      </Pressable>

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
