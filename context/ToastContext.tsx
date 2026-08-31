import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

/** Matches the signed-in tab bar height in App.tsx so the toast sits just above it. */
const TAB_BAR_HEIGHT = 88;
const TOAST_GAP = 10;
const SLOT_HEIGHT = 56;
/** Far enough to start fully below the clip (behind the tab bar). */
const HIDDEN_Y = SLOT_HEIGHT + 8;
const DEFAULT_DURATION = 2200;

type ToastContextValue = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const translateY = useRef(new Animated.Value(HIDDEN_Y)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionRef = useRef<Animated.CompositeAnimation | null>(null);

  const hide = useCallback(() => {
    motionRef.current?.stop();
    motionRef.current = Animated.spring(translateY, {
      toValue: HIDDEN_Y,
      friction: 9,
      tension: 110,
      useNativeDriver: true,
    });
    motionRef.current.start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [translateY]);

  const showToast = useCallback(
    (nextMessage: string) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      motionRef.current?.stop();
      setMessage(nextMessage);
      setMounted(true);
      translateY.setValue(HIDDEN_Y);
      requestAnimationFrame(() => {
        motionRef.current = Animated.spring(translateY, {
          toValue: 0,
          friction: 7,
          tension: 78,
          useNativeDriver: true,
        });
        motionRef.current.start();
      });
      hideTimer.current = setTimeout(hide, DEFAULT_DURATION);
    },
    [hide, translateY],
  );

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      motionRef.current?.stop();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {mounted ? (
          <View pointerEvents="none" style={styles.slot}>
            <Animated.View
              style={[styles.pillWrap, { transform: [{ translateY }] }]}
            >
              <View style={styles.pill}>
                <Text style={styles.text}>{message}</Text>
              </View>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: TAB_BAR_HEIGHT,
    height: SLOT_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: TOAST_GAP,
    overflow: "hidden",
    zIndex: 20,
  },
  pillWrap: {
    alignItems: "center",
  },
  pill: {
    maxWidth: 280,
    backgroundColor: Colors.dark,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  text: {
    color: "#fff",
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    textAlign: "center",
  },
});
