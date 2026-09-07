import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import {
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import {
  CalendarPlus,
  MapPinPlusInside,
  MessageSquarePlus,
  Plus,
  UserPlus,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import Button from "./Button";

const CARD_WIDTH = 308;
const CARD_PAD = 16;
const LAST_KIND_KEY = "create:lastKind";
const TAB_BAR_HEIGHT = 88;

type CreateKind = "community" | "event" | "spot" | "post";

const OPTIONS: {
  key: CreateKind;
  label: string;
  detail: string;
  Icon: typeof UserPlus;
  featured?: boolean;
}[] = [
  {
    key: "post",
    label: "Post",
    detail: "Photo, thought or update",
    Icon: MessageSquarePlus,
    featured: true,
  },
  {
    key: "spot",
    label: "Study spot",
    detail: "Add a place you found",
    Icon: MapPinPlusInside,
  },
  {
    key: "event",
    label: "Event",
    detail: "Study session or meetup",
    Icon: CalendarPlus,
  },
  {
    key: "community",
    label: "Community",
    detail: "Course, club or society",
    Icon: UserPlus,
  },
];

function findRootNavigator(
  navigation: NavigationProp<ParamListBase>,
): NavigationProp<ParamListBase> {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  let last = navigation;
  for (let depth = 0; depth < 8 && nav; depth += 1) {
    last = nav;
    if (nav.getState?.()?.routeNames?.includes("MainTabs")) return nav;
    nav = nav.getParent?.();
  }
  return last;
}

function openCreate(
  navigation: NavigationProp<ParamListBase>,
  kind: CreateKind,
) {
  const root = findRootNavigator(navigation);
  if (kind === "post") {
    root.navigate("FeedComposer");
    return;
  }
  if (kind === "event") {
    root.navigate("CreateEvent", {});
    return;
  }
  if (kind === "community") {
    root.navigate("MainTabs", {
      screen: "Community",
      params: { screen: "CreateCommunity", initial: false },
    });
    return;
  }
  root.navigate("MainTabs", {
    screen: "Spots",
    params: { screen: "CreateSpot", initial: false },
  });
}

export default function CreateSunMenu() {
  const { width: windowW } = useWindowDimensions();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const plusWrapRef = useRef<View>(null);
  const rotate = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, width: 32, height: 32 });
  const [lastKind, setLastKind] = useState<CreateKind>("post");

  useEffect(() => {
    void AsyncStorage.getItem(LAST_KIND_KEY).then((value) => {
      if (
        value === "post" ||
        value === "spot" ||
        value === "event" ||
        value === "community"
      ) {
        setLastKind(value);
      }
    });
  }, []);

  const playOpen = () => {
    closingRef.current = false;
    rotate.setValue(0);
    overlay.setValue(0);
    cardAnim.setValue(0);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(overlay, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(cardAnim, {
          toValue: 1,
          friction: 7,
          tension: 78,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const openMenu = () => {
    const node = plusWrapRef.current;
    const show = () => {
      setOpen(true);
      playOpen();
    };
    if (!node) {
      show();
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y, width, height });
      show();
    });
  };

  const closeMenu = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(overlay, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 0,
        duration: 170,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rotate, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      closingRef.current = false;
      if (!finished) return;
      setOpen(false);
      after?.();
    });
  };

  const pick = (kind: CreateKind) => {
    setLastKind(kind);
    void AsyncStorage.setItem(LAST_KIND_KEY, kind).catch(() => {});
    closeMenu(() => openCreate(navigation, kind));
  };

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  const cardOpacity = cardAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 1, 1],
  });
  const cardScale = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });
  const cardTranslateY = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-22, 0],
  });
  const hintOpacity = overlay.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, 0, 1],
  });
  const hintTranslateY = overlay.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  const cardLeft = Math.max(
    CARD_PAD,
    Math.min(origin.x + origin.width - CARD_WIDTH, windowW - CARD_WIDTH - CARD_PAD),
  );

  return (
    <>
      <View
        ref={plusWrapRef}
        collapsable={false}
        style={open ? styles.triggerHidden : undefined}
      >
        <Button
          size="icon"
          variant="ghost"
          style={styles.triggerBtn}
          icon={<Plus size={26} color={Colors.dark} strokeWidth={2.2} />}
          onPress={openMenu}
        />
      </View>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeMenu()}
      >
        <View style={styles.modalRoot}>
          <Animated.View
            pointerEvents="none"
            style={[styles.backdropLayer, { opacity: overlay }]}
          >
            <BlurView
              intensity={48}
              tint="dark"
              experimentalBlurMethod={
                Platform.OS === "android" ? "dimezisBlurView" : undefined
              }
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.backdropTint} />
          </Animated.View>

          <Pressable
            style={styles.backdropHit}
            onPress={() => closeMenu()}
            accessibilityRole="button"
            accessibilityLabel="Dismiss create menu"
          />

          <Animated.View
            style={[
              styles.card,
              {
                top: origin.y + origin.height + 12,
                left: cardLeft,
                opacity: cardOpacity,
                transformOrigin: "top right",
                transform: [
                  { translateY: cardTranslateY },
                  { scale: cardScale },
                ],
              },
            ]}
          >
            <Text style={styles.heading}>Quick create</Text>
            {OPTIONS.map((option, index) => {
              const Icon = option.Icon;
              const isLast = option.key === lastKind;
              return (
                <View key={option.key}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <Pressable
                    onPress={() => pick(option.key)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.rowPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                  >
                    <View style={styles.rowIcon}>
                      <Icon
                        size={20}
                        color={Colors.primary}
                        strokeWidth={2.2}
                      />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{option.label}</Text>
                      <Text style={styles.rowDetail}>{option.detail}</Text>
                    </View>
                    {isLast ? (
                      <View style={styles.lastBadge}>
                        <Text style={styles.lastBadgeText}>Last</Text>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </Animated.View>

          <Animated.Text
            pointerEvents="none"
            style={[
              styles.closeHint,
              {
                bottom: TAB_BAR_HEIGHT + 12,
                opacity: hintOpacity,
                transform: [{ translateY: hintTranslateY }],
              },
            ]}
          >
            Click anywhere to close
          </Animated.Text>

          <Animated.View
            style={[
              styles.hub,
              {
                left: origin.x,
                top: origin.y,
                width: origin.width,
                height: origin.height,
                transform: [{ rotate: spin }],
              },
            ]}
          >
            <Button
              size="icon"
              variant="ghost"
              style={styles.triggerBtn}
              icon={<Plus size={26} color="#fff" strokeWidth={2.2} />}
              onPress={() => closeMenu()}
            />
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerBtn: {
    marginBottom: 0,
  },
  triggerHidden: {
    opacity: 0,
  },
  modalRoot: {
    flex: 1,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  backdropHit: {
    ...StyleSheet.absoluteFillObject,
  },
  closeHint: {
    position: "absolute",
    left: 24,
    right: 24,
    textAlign: "center",
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    letterSpacing: 0.2,
    color: "rgba(255,255,255,0.78)",
    zIndex: 2,
  },
  card: {
    position: "absolute",
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingTop: 16,
    paddingBottom: 4,
    overflow: "hidden",
    zIndex: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  heading: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#9AA0A6",
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E6E6E6",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowPressed: {
    backgroundColor: "#EEF2F6",
  },
  rowIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 17,
    color: Colors.dark,
  },
  rowDetail: {
    marginTop: 2,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#8A8F96",
  },
  lastBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#D7E6F6",
  },
  lastBadgeText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.primary,
  },
  hub: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
});
