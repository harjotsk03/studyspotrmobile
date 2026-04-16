import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import Button from './Button';

interface CommunityCardProps {
  name: string;
  members: number;
  description: string;
  icon?: string;
  color?: string;
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
  memberAvatars = [],
  joined = false,
  onJoin,
  onPress,
}: CommunityCardProps) {
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

        {memberAvatars.length > 0 && (
          <View style={styles.avatarStack}>
            {memberAvatars.slice(0, 3).map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={[styles.memberAvatar, { right: i * 18 }]}
              />
            ))}
          </View>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.members}>{members.toLocaleString()} members</Text>
      <Text style={styles.description} numberOfLines={2}>
        {description}
      </Text>

      <View style={styles.buttonContainer}>
        <Button label={"View"} variant={"secondary"} size="default" fullWidth={true} onPress={onPress} />
      </View>
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
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  iconInitial: {
    color: "#fff",
    fontFamily: Fonts.gabarito.bold,
    fontSize: 26,
  },
  avatarStack: {
    flexDirection: "row-reverse",
    alignItems: "center",
    width: 30 + 18 * 2,
    height: 30,
  },
  memberAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#fff",
    position: "absolute",
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
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
});
