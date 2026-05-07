import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import Button from './Button';
import { getUserAvatarColor, getUserInitials } from "../utils/avatar";

interface LatestMember {
  id?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  profile_photo?: string;
  avatar_url?: string;
}

interface CommunityCardProps {
  name: string;
  members: number;
  description: string;
  icon?: string;
  color?: string;
  latestMembers?: LatestMember[];
  memberAvatars?: string[];
  joined?: boolean;
  onJoin?: () => void;
  onPress?: () => void;
}

export default function CommunityCard({
  name,
  members,
  description,
  icon,
  color = Colors.accent,
  latestMembers = [],
  memberAvatars = [],
  joined = false,
  onJoin,
  onPress,
}: CommunityCardProps) {
  const displayedMembers: LatestMember[] =
    latestMembers.length > 0
      ? latestMembers
      : memberAvatars.map((profile_photo) => ({ profile_photo }));

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: color }]}>
          {icon ? (
            <Image source={{ uri: icon }} style={styles.iconImage} />
          ) : (
            <Text style={styles.iconInitial}>
              {name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>

        {displayedMembers.length > 0 && (
          <View style={styles.avatarStack}>
            {displayedMembers.slice(0, 3).map((member, i) => {
              const photoUri = member.profile_photo ?? member.avatar_url;

              return (
                <View
                  key={member.id ?? member.username ?? photoUri ?? i}
                  style={[
                    styles.memberAvatar,
                    {
                      right: i * 18,
                      zIndex: displayedMembers.length - i,
                      backgroundColor: getUserAvatarColor(member),
                    },
                  ]}
                >
                  <Text style={styles.memberInitials}>
                    {getUserInitials(member)}
                  </Text>

                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.memberAvatarImage}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.members}>
        {members.toLocaleString()} {members === 1 ? "member" : "members"}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  iconInitial: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 26,
  },
  avatarStack: {
    width: 30 + 18 * 2,
    height: 30,
    position: "relative",
  },
  memberAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#fff",
    position: "absolute",
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  memberAvatarImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  memberInitials: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 10,
  },
  name: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 20,
    color: Colors.dark,
  },
  members: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
    marginTop: 2,
    marginBottom: 8,
  },
  description: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: Colors.dark,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
});
