import { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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

const STACK_WIDTH = 108;

type CreateKind = "community" | "event" | "spot" | "post";

const OPTIONS: {
  key: CreateKind;
  label: string;
  Icon: typeof UserPlus;
}[] = [
  { key: "community", label: "Community", Icon: UserPlus },
  { key: "event", label: "Event", Icon: CalendarPlus },
  { key: "spot", label: "Spot", Icon: MapPinPlusInside },
  { key: "post", label: "Post", Icon: MessageSquarePlus },
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
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const plusWrapRef = useRef<View>(null);
  const rotate = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, width: 32, height: 32 });

  const spinTo = (openMenu: boolean, onDone?: () => void) => {
    Animated.timing(rotate, {
      toValue: openMenu ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone?.();
    });
  };

  const openMenu = () => {
    const node = plusWrapRef.current;
    const show = () => {
      setOpen(true);
      rotate.setValue(0);
      requestAnimationFrame(() => spinTo(true));
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
    spinTo(false, () => {
      setOpen(false);
      after?.();
    });
  };

  const pick = (kind: CreateKind) => {
    closeMenu(() => openCreate(navigation, kind));
  };

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

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
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => closeMenu()}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => closeMenu()}
            accessibilityRole="button"
            accessibilityLabel="Dismiss create menu"
          />
          <View
            pointerEvents="box-none"
            style={[
              styles.stack,
              {
                top: origin.y + origin.height + 10,
                left: origin.x + origin.width / 2 - STACK_WIDTH / 2,
                width: STACK_WIDTH,
              },
            ]}
          >
            {OPTIONS.map((option) => {
              const Icon = option.Icon;
              return (
                <View key={option.key} style={styles.option}>
                  <Button
                    size="icon"
                    variant="outline"
                    icon={
                      <Icon size={18} color={Colors.dark} strokeWidth={2.2} />
                    }
                    onPress={() => pick(option.key)}
                  />
                  <Text style={styles.optionLabel}>{option.label}</Text>
                </View>
              );
            })}
            <Text style={styles.title}>Quick create</Text>
          </View>

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
              variant="secondary"
              style={styles.triggerBtn}
              icon={<Plus size={26} color={Colors.dark} strokeWidth={2.2} />}
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  stack: {
    position: "absolute",
    alignItems: "center",
    gap: 12,
    zIndex: 2,
  },
  title: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 13,
    color: "#fff",
    textAlign: "center",
    marginTop: 4,
  },
  option: {
    alignItems: "center",
    gap: 4,
  },
  optionLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    color: "#fff",
    textAlign: "center",
  },
  hub: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});
