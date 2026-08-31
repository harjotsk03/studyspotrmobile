import { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, MessageCircle, Search, X } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import { navigateToInboxMessagesList } from "../utils/navigateToInboxChat";
import CreateSunMenu from "./CreateSunMenu";

type TopNavProps = {
  onOpenSettings?: () => void;
};

export default function TopNav({ onOpenSettings }: TopNavProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  const openSearch = () => {
    if (searchOpen || closingRef.current) return;
    setSearchOpen(true);
    progress.setValue(0);
    requestAnimationFrame(() => {
      Animated.spring(progress, {
        toValue: 1,
        friction: 6,
        tension: 92,
        useNativeDriver: true,
      }).start();
      inputRef.current?.focus();
    });
  };

  const closeSearch = () => {
    if (!searchOpen || closingRef.current) return;
    closingRef.current = true;
    inputRef.current?.blur();
    Keyboard.dismiss();
    Animated.timing(progress, {
      toValue: 0,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      closingRef.current = false;
      if (!finished) return;
      setSearchOpen(false);
      setQuery("");
    });
  };

  const barOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const barTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-16, 0],
  });
  const barScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.side}>
        {token ? <CreateSunMenu /> : <View style={styles.iconBtn} />}
      </View>

      <View style={styles.center}>
        {!searchOpen ? (
          <Pressable
            onPress={openSearch}
            style={styles.searchHit}
            accessibilityRole="button"
            accessibilityLabel="Click to search"
          >
            <Text style={styles.searchHitLabel}>Click to search</Text>
          </Pressable>
        ) : (
          <Animated.View
            style={[
              styles.searchField,
              {
                opacity: barOpacity,
                transform: [
                  { translateY: barTranslateY },
                  { scale: barScale },
                ],
              },
            ]}
          >
            <Search size={16} color="#8C8C8C" strokeWidth={2.2} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor="#8C8C8C"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              autoFocus
              onBlur={() => {
                if (!query.trim()) closeSearch();
              }}
              accessibilityLabel="Search"
            />
            <Pressable onPress={closeSearch} hitSlop={8} accessibilityLabel="Close search">
              <X size={16} color="#8C8C8C" strokeWidth={2.2} />
            </Pressable>
          </Animated.View>
        )}
      </View>

      <View style={[styles.side, onOpenSettings ? styles.sidePair : undefined]}>
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
            {onOpenSettings ? (
              <Pressable
                onPress={onOpenSettings}
                hitSlop={10}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <Menu size={26} color={Colors.dark} strokeWidth={2} />
              </Pressable>
            ) : null}
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
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: Colors.light,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE",
    zIndex: 10,
  },
  side: {
    width: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  sidePair: {
    width: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  center: {
    flex: 1,
    minHeight: 38,
    justifyContent: "center",
  },
  searchHit: {
    flex: 1,
    minHeight: 38,
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  searchHitLabel: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#C5C9CE",
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark,
    paddingVertical: 0,
    fontFamily: Fonts.instrument.regular,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
