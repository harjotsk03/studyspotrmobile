import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';

type ProfileSectionButtonProps = {
  title: string;
  subtitle: string;
  onPress: () => void;
};

export default function ProfileSectionButton({
  title,
  subtitle,
  onPress,
}: ProfileSectionButtonProps) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={20} color="#888" strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    gap: 12,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    lineHeight: 20,
    color: '#777',
  },
});
