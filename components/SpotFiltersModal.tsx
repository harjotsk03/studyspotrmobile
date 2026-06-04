import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Coffee,
  MapPin,
  Presentation,
  RotateCcw,
  Star,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react-native";
import Button from "./Button";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";

export type SpotFiltersValue = {
  nearbyOnly: boolean;
  mapReadyOnly: boolean;
  minRating: number;
  amenities: {
    wifi: boolean;
    outlets: boolean;
    foodDrink: boolean;
    whiteboards: boolean;
    groupWork: boolean;
  };
};

export const DEFAULT_SPOT_FILTERS: SpotFiltersValue = {
  nearbyOnly: false,
  mapReadyOnly: false,
  minRating: 0,
  amenities: {
    wifi: false,
    outlets: false,
    foodDrink: false,
    whiteboards: false,
    groupWork: false,
  },
};

export function countActiveFilters(filters: SpotFiltersValue) {
  let count = 0;
  if (filters.nearbyOnly) count += 1;
  if (filters.mapReadyOnly) count += 1;
  if (filters.minRating > 0) count += 1;
  count += Object.values(filters.amenities).filter(Boolean).length;
  return count;
}

type AmenityKey = keyof SpotFiltersValue["amenities"];

type LucideIcon = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const AMENITY_OPTIONS: { key: AmenityKey; label: string; Icon: LucideIcon }[] =
  [
    { key: "wifi", label: "Wi-Fi", Icon: Wifi },
    { key: "outlets", label: "Outlets", Icon: Zap },
    { key: "foodDrink", label: "Food & Drinks", Icon: Coffee },
    { key: "whiteboards", label: "Whiteboards", Icon: Presentation },
    { key: "groupWork", label: "Group Friendly", Icon: Users },
  ];

const RATING_OPTIONS = [
  { value: 3, label: "3+" },
  { value: 3.5, label: "3.5+" },
  { value: 4, label: "4+" },
  { value: 4.5, label: "4.5+" },
];

const SCREEN_HEIGHT = Dimensions.get("window").height;

/** Intentionally very forgiving thresholds so the filters sheet feels
 * effortless to dismiss — any noticeable downward swipe closes it. The
 * comments modal stays stricter because it sits over a list the user
 * actively scrolls; this sheet doesn't, so we don't need that guardrail.
 *   • Drag 40 px down                → close
 *   • Flick downward at 0.2 px/ms+   → close (after only 5 px of travel) */
const DISMISS_DRAG_DISTANCE = 40;
const DISMISS_FLICK_VELOCITY = 0.2;
const DISMISS_FLICK_MIN_DISTANCE = 5;

type Props = {
  visible: boolean;
  value: SpotFiltersValue;
  hasUserLocation: boolean;
  onChange: (next: SpotFiltersValue) => void;
  onClose: () => void;
  onReset: () => void;
};

export default function SpotFiltersModal({
  visible,
  value,
  hasUserLocation,
  onChange,
  onClose,
  onReset,
}: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  /** Snapshot of `translateY` at the moment a drag begins. */
  const dragStartTranslateRef = useRef(0);
  /** Prevents re-entrant close calls when the user flick-dismisses in the
   * middle of an already-running exit animation. */
  const closingRef = useRef(false);

  const enter = useCallback(() => {
    closingRef.current = false;
    translateY.setValue(SCREEN_HEIGHT);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, backdropOpacity]);

  /** Animate the sheet closed, then call `onClose`. `flickVelocity` (px/ms)
   * shortens the exit when the user actively flicked downward, so the
   * dismiss feels like a continuation of their swipe. */
  const dismiss = useCallback(
    (flickVelocity?: number) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Keyboard.dismiss();

      const flicked = typeof flickVelocity === "number" && flickVelocity > 0;
      const sheetDuration = flicked ? 180 : 240;
      const fadeDuration = flicked ? 150 : 200;

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: sheetDuration,
          easing: flicked ? Easing.out(Easing.quad) : Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: fadeDuration,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        closingRef.current = false;
        if (finished) {
          setMounted(false);
          onClose();
        }
      });
    },
    [translateY, backdropOpacity, onClose],
  );

  const springBack = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      friction: 8,
      tension: 120,
      useNativeDriver: true,
    }).start();
    Animated.timing(backdropOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [translateY, backdropOpacity]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      enter();
    } else if (mounted) {
      dismiss();
    }
    // We deliberately exclude `mounted` from the dep array — the effect's
    // job is to react to `visible`, not bounce when we toggle our own
    // mount latch inside `dismiss`. The other deps are stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dragPanResponder = useMemo(
    () => {
      // Conditions for taking ownership of a touch: a tiny bit of
      // downward travel that's not predominantly horizontal. This is
      // intentionally sensitive — the user wants empty white space on
      // the sheet to drag the sheet down just as easily as a button.
      const shouldClaim = (
        _evt: unknown,
        g: { dy: number; dx: number },
      ) => {
        if (closingRef.current) return false;
        const downward = g.dy > 1;
        const mostlyVertical = Math.abs(g.dy) > Math.abs(g.dx) * 0.4;
        return downward && mostlyVertical;
      };

      return PanResponder.create({
        // Capture phase: fires when a child Pressable (chip / X / button)
        // is the current responder — lets us steal the gesture from it
        // mid-press once the user has clearly started swiping down.
        onMoveShouldSetPanResponderCapture: shouldClaim,
        // Bubble phase: fires when NO descendant has claimed the touch
        // (e.g. the user pressed on plain white space in the sheet's
        // body). Without this handler RN doesn't reliably invoke the
        // capture variant for un-claimed touches, which is why the
        // drag previously only worked starting on buttons / text.
        onMoveShouldSetPanResponder: shouldClaim,
        // Explicitly opt out of start-phase claiming so tap-to-toggle on
        // chips, the X header button, and the footer CTAs still works
        // — we only claim once the finger has actually moved.
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onPanResponderGrant: () => {
          translateY.stopAnimation((v) => {
            dragStartTranslateRef.current = v;
          });
        },
        onPanResponderMove: (_evt, g) => {
          const next = Math.max(0, dragStartTranslateRef.current + g.dy);
          translateY.setValue(next);
          // Dim the backdrop in lockstep so the dismiss intent reads
          // immediately, without waiting for release.
          const fade = Math.max(0, 1 - next / SCREEN_HEIGHT);
          backdropOpacity.setValue(fade);
        },
        onPanResponderRelease: (_evt, g) => {
          const flick =
            g.vy > DISMISS_FLICK_VELOCITY &&
            g.dy > DISMISS_FLICK_MIN_DISTANCE;
          const slow = g.dy > DISMISS_DRAG_DISTANCE;
          if (flick || slow) {
            dismiss(flick ? g.vy : undefined);
          } else {
            springBack();
          }
        },
        onPanResponderTerminate: () => {
          springBack();
        },
        onPanResponderTerminationRequest: () => false,
      });
    },
    [translateY, backdropOpacity, dismiss, springBack],
  );

  if (!mounted) return null;

  const toggleAmenity = (key: AmenityKey) => {
    onChange({
      ...value,
      amenities: {
        ...value.amenities,
        [key]: !value.amenities[key],
      },
    });
  };

  const setMinRating = (rating: number) => {
    onChange({
      ...value,
      minRating: value.minRating === rating ? 0 : rating,
    });
  };

  const activeCount = countActiveFilters(value);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss()}
    >
      <View style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
        {/* Tappable backdrop sits between the dim layer and the sheet so
            tapping outside still dismisses. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
        />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            { transform: [{ translateY }] },
          ]}
          {...dragPanResponder.panHandlers}
        >
          {/* Grabber sits above the header so it visually anchors the
              drag affordance — matches the comments modal pattern. */}
          <View style={styles.grabberWrap} pointerEvents="none">
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerSide} />
            <View style={styles.headerCenter}>
              <Text style={styles.title}>Filters</Text>
              {activeCount > 0 ? (
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{activeCount}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={() => dismiss()}
              hitSlop={12}
              style={styles.headerSide}
              accessibilityRole="button"
              accessibilityLabel="Close filters"
            >
              <X size={22} color={Colors.dark} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View
            style={styles.body}
            // Prevent Android view flattening so plain white space inside
            // the body is guaranteed to be present in the native view
            // tree — this is critical for the drag-down gesture to fire
            // when the user touches an empty area between chip groups.
            collapsable={false}
          >
            <Section title="Distance">
              <View style={styles.chipsRow}>
                <FilterChip
                  label="Within 10 km"
                  Icon={MapPin}
                  active={value.nearbyOnly}
                  disabled={!hasUserLocation}
                  onPress={() =>
                    onChange({ ...value, nearbyOnly: !value.nearbyOnly })
                  }
                />
              </View>
              {!hasUserLocation ? (
                <Text style={styles.helper}>
                  Enable location to filter by distance.
                </Text>
              ) : null}
            </Section>

            <Section title="Minimum rating">
              <View style={styles.chipsRow}>
                {RATING_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    Icon={Star}
                    active={value.minRating === option.value}
                    onPress={() => setMinRating(option.value)}
                  />
                ))}
              </View>
            </Section>

            <Section title="Amenities">
              <View style={styles.chipsRow}>
                {AMENITY_OPTIONS.map((option) => (
                  <FilterChip
                    key={option.key}
                    label={option.label}
                    Icon={option.Icon}
                    active={value.amenities[option.key]}
                    onPress={() => toggleAmenity(option.key)}
                  />
                ))}
              </View>
            </Section>
          </View>

          <View style={styles.footer}>
            <Button
              label="Reset"
              variant="outline"
              size="default"
              icon={<RotateCcw size={18} strokeWidth={2.2} />}
              onPress={onReset}
              haptic="light"
            />
            <Button
              label={"Show results"}
              variant="accent"
              size="default"
              onPress={() => dismiss()}
              haptic="medium"
              style={styles.footerPrimary}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FilterChip({
  label,
  Icon,
  active,
  disabled,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.chipPressed,
      ]}
    >
      <Icon
        size={15}
        color={active ? "#fff" : Colors.dark}
        strokeWidth={2.2}
      />
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 4,
    paddingHorizontal: 4,
    maxHeight: "88%",
    // Soft shadow above the sheet's rounded top edge so the elevation
    // feels in line with the rest of the app's bottom sheets.
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  grabberWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  headerSide: {
    width: 44,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 19,
    color: Colors.dark,
  },
  // Little count pill next to the title — accent-tinted so the page
  // matches the app's brand without needing a long subtitle.
  countPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 12,
    color: "#fff",
  },
  body: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.25,
    borderColor: "#E6E6E6",
    backgroundColor: "#fff",
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipActive: {
    // Brand accent for the active state — matches the heart badge, the
    // tab focus ring, and the primary CTAs across the app.
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.dark,
  },
  chipLabelActive: {
    color: "#fff",
  },
  helper: {
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#888",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
    marginTop: 8,
  },
  footerSecondary: {
    flexBasis: 130,
    flexGrow: 0,
    flexShrink: 0,
  },
  footerPrimary: {
    flex: 1,
  },
});
