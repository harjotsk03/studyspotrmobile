import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageCircle } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { useAuth } from "../context/AuthContext";
import { navigateToInboxMessagesList } from "../utils/navigateToInboxChat";
import CreateSunMenu from "./CreateSunMenu";

type TopNavProps = {
  left?: ReactNode;
};

export default function TopNav({ left }: TopNavProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { token } = useAuth();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.left}>{left ?? <View style={styles.iconBtn} />}</View>
      <View style={styles.right}>
        {token ? (
          <>
            <Pressable
              onPress={() => navigateToInboxMessagesList(navigation)}
              hitSlop={10}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Messages"
            >
              <MessageCircle size={26} color={Colors.dark} strokeWidth={2} />
            </Pressable>
            <CreateSunMenu />
          </>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: Colors.light,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE",
    zIndex: 10,
  },
  left: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: 32,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
