import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import MapView, { Marker } from "react-native-maps";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowLeft, ImagePlus, MapPin, Star, VolumeX, Volume1, Volume2, AudioLines, Moon, Sun, Armchair, LayoutGrid, Grid2x2, Wifi, Plug, Coffee, Presentation, Users, Check, Clock } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import FadeInUp from "../components/FadeInUp";
import Input from "../components/Input";
import SmoothProgressBar from "../components/SmoothProgressBar";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import { type StudySpot, useSpots } from "../context/SpotsContext";
import type { RootStackParamList, SpotsStackParamList } from "../types/navigation";
import {
  createSpotMultipart,
  SpotDuplicateError,
  updateSpotMultipart,
} from "../utils/spotsApi";
import { getSpotCoordinates } from "../utils/getSpotCoordinates";
import { getSpotTitle } from "../utils/getSpotTitle";
import { isSpotAlwaysOpen } from "../utils/spotHours";

const STEPS_CREATE = ["Place", "Atmosphere", "Amenities", "Hours", "Photos & review"] as const;
const STEPS_EDIT = ["Place", "Atmosphere", "Amenities", "Hours"] as const;

const STEP_COPY: Record<
  (typeof STEPS_CREATE)[number],
  { title: string; subtitle: string }
> = {
  Place: {
    title: "Where is this spot?",
    subtitle: "Give it a name, add the address, and drop a pin on the map.",
  },
  Atmosphere: {
    title: "What's the vibe?",
    subtitle: "Three quick reads. You can change them later.",
  },
  Amenities: {
    title: "What's available?",
    subtitle: "Tap everything this spot has.",
  },
  Hours: {
    title: "When is it open?",
    subtitle: "Set the hours or mark it as always open.",
  },
  "Photos & review": {
    title: "Photos & a first review",
    subtitle: "Add 1–5 photos and tell people what it's like to study here.",
  },
};

const MAP_HEIGHT = 220;
/** Default map framing (Toronto) before the user chooses a pin. */
const FALLBACK_LAT = 43.653226;
const FALLBACK_LNG = -79.383184;
const MAP_DELTA = { latitudeDelta: 0.014, longitudeDelta: 0.014 };

const NOICE_OPTIONS = ["Quiet", "Moderate", "Lively", "Variable"] as const;
const LIGHTING_OPTIONS = ["Dim", "Moderate", "Bright"] as const;
const TABLES_OPTIONS = ["Limited", "Enough", "Plenty"] as const;

type VibeChoice = {
  value: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
};

const NOISE_CHOICES: VibeChoice[] = [
  {
    value: "Quiet",
    label: "Quiet",
    hint: "Almost silent — laptops and the occasional whisper.",
    Icon: VolumeX,
  },
  {
    value: "Moderate",
    label: "Moderate",
    hint: "Some background chatter — most people still work solo.",
    Icon: Volume1,
  },
  {
    value: "Lively",
    label: "Lively",
    hint: "A buzz of conversation — better with headphones.",
    Icon: Volume2,
  },
  {
    value: "Variable",
    label: "Varies",
    hint: "It changes by time of day — check before you settle.",
    Icon: AudioLines,
  },
];

const LIGHTING_CHOICES: VibeChoice[] = [
  {
    value: "Dim",
    label: "Dim",
    hint: "Low light — lamps, evenings, a cozier feel.",
    Icon: Moon,
  },
  {
    value: "Moderate",
    label: "Moderate",
    hint: "Even lighting — comfortable for most work.",
    Icon: Sun,
  },
  {
    value: "Bright",
    label: "Bright",
    hint: "Big windows or strong overheads — good for daytime.",
    Icon: Sun,
  },
];

const TABLES_CHOICES: VibeChoice[] = [
  {
    value: "Limited",
    label: "Limited",
    hint: "Seats go fast — arrive early or have a backup.",
    Icon: Armchair,
  },
  {
    value: "Enough",
    label: "Enough",
    hint: "You'll usually find a seat, but not at 4pm.",
    Icon: LayoutGrid,
  },
  {
    value: "Plenty",
    label: "Plenty",
    hint: "Lots of tables — easy to spread out.",
    Icon: Grid2x2,
  },
];

function pickChipOption(raw: unknown, options: readonly string[], fallback: string): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (t && options.includes(t)) return t;
  return fallback;
}

function boolSpot(v: unknown, defaultValue: boolean): boolean {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return defaultValue;
}

function parseCoordinates(latRaw: string, lngRaw: string): { lat: number; lng: number } | null {
  const lat = Number(latRaw.trim().replace(",", "."));
  const lng = Number(lngRaw.trim().replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function timeStringToDate(raw: string, fallbackHour: number): Date {
  const date = new Date();
  const match = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!match) {
    date.setHours(fallbackHour, 0, 0, 0);
    return date;
  }
  let hours = Math.min(23, Math.max(0, Number(match[1])));
  let minutes = Math.min(59, Math.max(0, Number(match[2])));
  minutes = Math.round(minutes / 5) * 5;
  if (minutes === 60) {
    hours = (hours + 1) % 24;
    minutes = 0;
  }
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateToTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatTimeLabel(raw: string, fallbackHour: number): string {
  return timeStringToDate(raw, fallbackHour).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatGeocodedAddress(
  result: Location.LocationGeocodedAddress,
  fallback: string,
): string {
  const line =
    [result.streetNumber, result.street].filter(Boolean).join(" ") ||
    result.name ||
    result.district ||
    "";
  const cityLine = [result.city, result.region, result.postalCode, result.country]
    .filter(Boolean)
    .join(", ");
  const composed = line && cityLine ? `${line}, ${cityLine}` : line || cityLine;
  return composed || fallback;
}

type WizardField =
  | "name"
  | "description"
  | "address"
  | "location"
  | "review"
  | "photos";

const FIELD_ORDER: WizardField[] = [
  "name",
  "description",
  "address",
  "location",
  "review",
  "photos",
];

function VibePicker({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly VibeChoice[];
  value: string;
  onChange: (v: string) => void;
}) {
  const INSET = 3;
  const count = choices.length;
  const index = Math.max(
    0,
    choices.findIndex((choice) => choice.value === value),
  );
  const selected = choices[index] ?? choices[0];
  const [segmentW, setSegmentW] = useState(0);
  const slideX = useRef(new Animated.Value(INSET)).current;
  const startX = useRef(INSET);
  const indexRef = useRef(index);
  const segmentWRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const choicesRef = useRef(choices);
  indexRef.current = index;
  onChangeRef.current = onChange;
  choicesRef.current = choices;

  const xForIndex = (i: number, width: number) => i * width + INSET;

  useEffect(() => {
    if (segmentW <= 0) return;
    Animated.spring(slideX, {
      toValue: xForIndex(index, segmentW),
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [index, segmentW, slideX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        startX.current = xForIndex(indexRef.current, segmentWRef.current);
        slideX.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        const n = choicesRef.current.length;
        const width = segmentWRef.current;
        if (width <= 0) return;
        const min = INSET;
        const max = xForIndex(n - 1, width);
        slideX.setValue(Math.max(min, Math.min(max, startX.current + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const n = choicesRef.current.length;
        const width = segmentWRef.current;
        if (width <= 0) return;
        const raw = startX.current + g.dx;
        const next = Math.max(
          0,
          Math.min(n - 1, Math.round((raw - INSET) / width)),
        );
        Animated.spring(slideX, {
          toValue: xForIndex(next, width),
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }).start();
        onChangeRef.current(choicesRef.current[next].value);
      },
      onPanResponderTerminate: () => {
        const width = segmentWRef.current;
        if (width <= 0) return;
        Animated.spring(slideX, {
          toValue: xForIndex(indexRef.current, width),
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const thumbW = segmentW > 0 ? segmentW - INSET * 2 : 0;

  return (
    <View style={styles.vibeBlock}>
      <Text style={styles.vibeLabel}>{label}</Text>
      <View
        style={styles.vibeTrack}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width / count;
          const firstMeasure = segmentWRef.current === 0;
          segmentWRef.current = width;
          if (firstMeasure) {
            slideX.setValue(xForIndex(indexRef.current, width));
          }
          setSegmentW(width);
        }}
        {...panResponder.panHandlers}
      >
        {thumbW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.vibeThumb,
              { width: thumbW, transform: [{ translateX: slideX }] },
            ]}
          />
        ) : null}
        <View style={styles.vibeRow}>
          {choices.map((choice) => {
            const active = choice.value === value;
            const Icon = choice.Icon;
            return (
              <Pressable
                key={choice.value}
                onPress={() => onChange(choice.value)}
                style={styles.vibeOption}
              >
                <Icon
                  size={18}
                  color={active ? "#fff" : "#8B8B8B"}
                  strokeWidth={2.1}
                />
                <Text
                  style={[
                    styles.vibeTileText,
                    active && styles.vibeTileTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {choice.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.vibeHint}>{selected.hint}</Text>
    </View>
  );
}

function AmenityCard({
  title,
  subtitle,
  Icon,
  selected,
  onToggle,
  wide,
}: {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  selected: boolean;
  onToggle: () => void;
  wide?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const check = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(check, {
      toValue: selected ? 1 : 0,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [check, selected]);

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      speed: 20,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 22,
      bounciness: 9,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        wide ? styles.amenityCardWide : styles.amenityCardWrap,
        { transform: [{ scale }] },
      ]}
    >
      <Pressable
        onPress={onToggle}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={[
          styles.amenityCard,
          selected ? styles.amenityCardOn : styles.amenityCardOff,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.amenityCheck,
            { opacity: check, transform: [{ scale: check }] },
          ]}
        >
          <Check size={12} color="#fff" strokeWidth={3} />
        </Animated.View>
        <Icon
          size={22}
          color={selected ? Colors.primary : "#9A9A9A"}
          strokeWidth={2.1}
        />
        <Text
          style={[styles.amenityTitle, !selected && styles.amenityMuted]}
        >
          {title}
        </Text>
        <Text
          style={[styles.amenitySubtitle, !selected && styles.amenityMuted]}
        >
          {subtitle}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        trackColor={{ false: "#ddd", true: Colors.accent }}
        thumbColor="#fff"
        value={value}
        onValueChange={onValueChange}
      />
    </View>
  );
}

function TimeSelectRow({
  label,
  value,
  fallbackHour,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  fallbackHour: number;
  open: boolean;
  onToggle: () => void;
  onChange: (next: string) => void;
}) {
  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      if (event.type === "dismissed") {
        onToggle();
        return;
      }
      if (date) onChange(dateToTimeString(date));
      onToggle();
      return;
    }
    if (date) onChange(dateToTimeString(date));
  };

  return (
    <View style={styles.timeBlock}>
      <Pressable
        onPress={onToggle}
        disabled={Platform.OS === "ios"}
        style={[styles.timeRow, open && styles.timeRowOpen]}
      >
        <Clock size={18} color={open ? Colors.primary : "#999"} strokeWidth={2.1} />
        <Text style={styles.timeLabel}>{label}</Text>
        <Text style={[styles.timeValue, open && styles.timeValueOpen]}>
          {formatTimeLabel(value, fallbackHour)}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={timeStringToDate(value, fallbackHour)}
          mode="time"
          display="spinner"
          is24Hour={false}
          minuteInterval={5}
          locale="en-US"
          themeVariant="light"
          accentColor={Colors.primary}
          textColor={Colors.dark}
          style={styles.timePicker}
          onChange={onPickerChange}
        />
      ) : null}
    </View>
  );
}

type WizardProps = NativeStackScreenProps<
  SpotsStackParamList & Pick<RootStackParamList, "CreateSpot" | "SpotViewer">,
  "CreateSpot" | "EditSpot"
>;

export default function SpotWizardScreen({ route, navigation }: WizardProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const { profile } = useAuth();
  const { refetchSpots } = useSpots();
  const user = profile?.userProfile;

  const isEdit = route.name === "EditSpot";
  const editSpot: StudySpot | undefined =
    route.name === "EditSpot" && route.params && "spot" in route.params
      ? route.params.spot
      : undefined;

  const initialEditCoords = useMemo(() => (editSpot ? getSpotCoordinates(editSpot) : null), [editSpot]);

  const lastGeocodedAddress = useRef(
    typeof editSpot?.address === "string" ? editSpot.address.trim() : "",
  );

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [findingOnMap, setFindingOnMap] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<WizardField, string>>>(
    {},
  );
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<WizardField, number>>>({});

  const [name, setName] = useState(() =>
    editSpot ? getSpotTitle(editSpot) : "",
  );
  const [description, setDescription] = useState(() =>
    typeof editSpot?.description === "string" ? editSpot.description : "",
  );
  const [address, setAddress] = useState(() =>
    typeof editSpot?.address === "string" ? editSpot.address : "",
  );
  const [latStr, setLatStr] = useState(() =>
    initialEditCoords ? initialEditCoords.latitude.toFixed(6) : "",
  );
  const [lngStr, setLngStr] = useState(() =>
    initialEditCoords ? initialEditCoords.longitude.toFixed(6) : "",
  );

  const [noiceLevel, setNoiceLevel] = useState(() =>
    pickChipOption(editSpot?.noice_level ?? editSpot?.noise_level, NOICE_OPTIONS, NOICE_OPTIONS[1]),
  );
  const [lighting, setLighting] = useState(() =>
    pickChipOption(editSpot?.lighting, LIGHTING_OPTIONS, LIGHTING_OPTIONS[1]),
  );
  const [tables, setTables] = useState(() =>
    pickChipOption(editSpot?.tables, TABLES_OPTIONS, TABLES_OPTIONS[1]),
  );

  const [foodDrink, setFoodDrink] = useState(() => boolSpot(editSpot?.food_drink_allowed, false));
  const [wifi, setWifi] = useState(() => boolSpot(editSpot?.wifi_available, true));
  const [outlets, setOutlets] = useState(() => boolSpot(editSpot?.outlets_available, true));
  const [whiteboards, setWhiteboards] = useState(() => boolSpot(editSpot?.whiteboards_available, false));
  const [groupWork, setGroupWork] = useState(() => boolSpot(editSpot?.group_work_friendly, true));

  const [openTime, setOpenTime] = useState(() =>
    typeof editSpot?.open_time === "string" && editSpot.open_time.trim()
      ? editSpot.open_time.trim()
      : "08:00",
  );
  const [closeTime, setCloseTime] = useState(() =>
    typeof editSpot?.close_time === "string" && editSpot.close_time.trim()
      ? editSpot.close_time.trim()
      : "22:00",
  );
  const [is24Hours, setIs24Hours] = useState(() => isSpotAlwaysOpen(editSpot));
  const [hoursPicker, setHoursPicker] = useState<"open" | "close" | null>(null);

  const [rating, setRating] = useState(5);
  const [reviewContent, setReviewContent] = useState("");
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);

  const steps = isEdit ? STEPS_EDIT : STEPS_CREATE;
  const LAST_STEP_IDX = steps.length - 1;

  const creatorName = useMemo(() => {
    if (!user) return "";
    const fn = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return fn || user.username || "Member";
  }, [user]);

  const coords = parseCoordinates(latStr, lngStr);
  const coordsValid = coords !== null;

  const animateMapTo = useCallback((lat: number, lng: number) => {
    if (Platform.OS === "web") return;
    mapRef.current?.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        ...MAP_DELTA,
      },
      380,
    );
  }, []);

  useEffect(() => {
    if (!initialEditCoords || Platform.OS === "web") return;
    const t = setTimeout(() => {
      animateMapTo(initialEditCoords.latitude, initialEditCoords.longitude);
    }, 350);
    return () => clearTimeout(t);
  }, [initialEditCoords, animateMapTo]);

  const setCoords = (lat: number, lng: number) => {
    setLatStr(lat.toFixed(6));
    setLngStr(lng.toFixed(6));
    clearFieldError("location");
  };

  const clearFieldError = (key: WizardField) => {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const markFieldOffset = (key: WizardField) => (e: LayoutChangeEvent) => {
    fieldOffsets.current[key] = e.nativeEvent.layout.y;
  };

  const scrollToField = (key: WizardField) => {
    const y = fieldOffsets.current[key];
    if (y == null) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    });
  };

  const mapInitialRegion = useMemo(
    () => ({
      latitude: FALLBACK_LAT,
      longitude: FALLBACK_LNG,
      ...MAP_DELTA,
    }),
    [],
  );

  const applyAddressFromCoords = async (lat: number, lng: number) => {
    const fallback = "Pinned location";
    try {
      const rev = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });
      const composed = rev?.[0]
        ? formatGeocodedAddress(rev[0], fallback)
        : fallback;
      setAddress(composed);
      lastGeocodedAddress.current = composed.trim();
      if (composed.trim()) clearFieldError("address");
    } catch {
      setAddress(fallback);
      lastGeocodedAddress.current = fallback;
      clearFieldError("address");
    }
  };

  const locateFromAddress = async (opts?: { silent?: boolean }) => {
    if (!address.trim()) {
      if (!opts?.silent) {
        Alert.alert("Address needed", "Enter an address first.");
      }
      return;
    }
    setFindingOnMap(true);
    try {
      const results = await Location.geocodeAsync(address.trim());
      if (!results?.length) {
        throw new Error("No results");
      }
      const lat = results[0].latitude;
      const lng = results[0].longitude;
      setCoords(lat, lng);
      animateMapTo(lat, lng);
      lastGeocodedAddress.current = address.trim();
    } catch {
      if (!opts?.silent) {
        Alert.alert(
          "Could not find that address",
          "Try a fuller address, or drop a pin on the map.",
        );
      }
    } finally {
      setFindingOnMap(false);
    }
  };

  const onAddressBlur = () => {
    const next = address.trim();
    if (!next || next === lastGeocodedAddress.current) return;
    void locateFromAddress({ silent: true });
  };

  const useCurrentLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow location to place this spot.");
      return;
    }
    setLocatingMe(true);
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords(lat, lng);
      animateMapTo(lat, lng);
      await applyAddressFromCoords(lat, lng);
    } catch {
      Alert.alert(
        "Location error",
        "Could not read GPS. Try again or drop a pin on the map.",
      );
    } finally {
      setLocatingMe(false);
    }
  };

  const onMapPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    if (Platform.OS === "web") return;
    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
    setCoords(lat, lng);
    animateMapTo(lat, lng);
    void (async () => {
      setFindingOnMap(true);
      try {
        await applyAddressFromCoords(lat, lng);
      } finally {
        setFindingOnMap(false);
      }
    })();
  };

  const onPinDragEnd = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
    setCoords(lat, lng);
    void (async () => {
      setFindingOnMap(true);
      try {
        await applyAddressFromCoords(lat, lng);
      } finally {
        setFindingOnMap(false);
      }
    })();
  };

  const pickPhotos = async () => {
    const remaining = Math.max(0, 5 - images.length);
    if (remaining === 0) {
      Alert.alert("Limit reached", "You can attach up to 5 photos.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    setImages((prev) => [...prev, ...result.assets].slice(0, 5));
    clearFieldError("photos");
  };

  const removePhoto = (idx: number) => {
    setImages((prev) => prev.filter((_, j) => j !== idx));
  };

  const validateStep = (s: number): boolean => {
    if (s === 0) {
      if (!user?.id) {
        Alert.alert("Sign in", isEdit ? "You need an account to edit this spot." : "You need an account to list a spot.");
        return false;
      }
      const next: Partial<Record<WizardField, string>> = {};
      if (!name.trim()) next.name = "Required";
      if (!description.trim()) next.description = "Required";
      if (!address.trim()) next.address = "Required";
      if (!coordsValid) next.location = "Drop a pin on the map";
      setFieldErrors(next);
      const first = FIELD_ORDER.find((key) => next[key]);
      if (first) {
        scrollToField(first);
        return false;
      }
      return true;
    }
    if (s === 4 && !isEdit) {
      const next: Partial<Record<WizardField, string>> = {};
      if (reviewContent.trim().length < 4) next.review = "Write a few words";
      if (images.length < 1) next.photos = "Add at least one photo";
      setFieldErrors(next);
      const first = FIELD_ORDER.find((key) => next[key]);
      if (first) {
        scrollToField(first);
        return false;
      }
      return true;
    }
    setFieldErrors({});
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setFieldErrors({});
    if (step < LAST_STEP_IDX) setStep((x) => x + 1);
    else void submit();
  };

  const goBackStep = () => {
    setFieldErrors({});
    if (step > 0) setStep((x) => x - 1);
    else navigation.goBack();
  };

  const submit = async () => {
    if (!user?.id) return;
    if (!validateStep(step)) return;
    const xy = coords;
    if (!xy) return;

    if (isEdit && !editSpot?.id) {
      Alert.alert("Error", "Missing spot id.");
      return;
    }

    const basePayload: Record<string, unknown> = {
      created_by_id: user.id,
      created_by_name: creatorName,
      name: name.trim(),
      description: description.trim(),
      address: address.trim(),
      latitude: xy.lat,
      longitude: xy.lng,
      noice_level: noiceLevel,
      lighting,
      tables,
      food_drink_allowed: foodDrink,
      wifi_available: wifi,
      outlets_available: outlets,
      whiteboards_available: whiteboards,
      group_work_friendly: groupWork,
      is_24_hours: is24Hours,
      open_time: is24Hours ? "00:00" : openTime.trim(),
      close_time: is24Hours ? "00:00" : closeTime.trim(),
    };

    setLoading(true);
    try {
      if (isEdit) {
        await updateSpotMultipart({
          ...basePayload,
          spot_id: editSpot!.id,
          user_id: user.id,
        });
        await refetchSpots();
        Alert.alert("Spot updated", `"${name.trim()}" was saved.`, [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
        return;
      }

      await createSpotMultipart(
        {
          ...basePayload,
          rating,
          content: reviewContent.trim(),
        },
        images.map((a) => ({
          uri: a.uri,
          mimeType: a.mimeType,
          fileName: a.fileName,
        })),
      );
      await refetchSpots();
      Alert.alert("Spot listed", `"${name.trim()}" is live.`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      if (e instanceof SpotDuplicateError) {
        const existing = e.duplicate.spot;
        const existingName =
          (typeof existing?.name === "string" && existing.name.trim()) ||
          "this spot";
        await refetchSpots().catch(() => {});
        Alert.alert(
          "Already on Studyspotr",
          `"${existingName}" is already listed at this location. We'll open it now so you can review or save it.`,
          [
            {
              text: "View spot",
              onPress: () => {
                const names = navigation.getState()?.routeNames ?? [];
                if (names.includes("SpotDetail")) {
                  if (route.name === "CreateSpot") {
                    navigation.replace("SpotDetail", { spot: existing });
                  } else {
                    navigation.navigate("SpotDetail", { spot: existing });
                  }
                  return;
                }
                navigation.replace("SpotViewer", { spot: existing });
              },
            },
          ],
        );
        return;
      }
      Alert.alert("Error", e instanceof Error ? e.message : isEdit ? "Could not update spot." : "Could not create spot.");
    } finally {
      setLoading(false);
    }
  };

  let stepBody: ReactNode = null;

  if (step === 0) {
    stepBody = (
      <>
        <View onLayout={markFieldOffset("name")}>
          <Input
            label="Spot name"
            value={name}
            error={fieldErrors.name}
            onChangeText={(value) => {
              setName(value);
              if (value.trim()) clearFieldError("name");
            }}
            placeholder="e.g. Robarts Library, 9th floor"
          />
        </View>
        <View onLayout={markFieldOffset("description")} style={styles.fieldGap}>
          <Input
            label="Description"
            value={description}
            error={fieldErrors.description}
            onChangeText={(value) => {
              setDescription(value);
              if (value.trim()) clearFieldError("description");
            }}
            multiline
            textAlignVertical="top"
            inputStyle={{ minHeight: 100 }}
            placeholder="What makes this a great place to study?"
          />
        </View>
        <View onLayout={markFieldOffset("address")} style={styles.fieldGap}>
          <Input
            label="Address"
            value={address}
            error={fieldErrors.address}
            onChangeText={(value) => {
              setAddress(value);
              if (value.trim()) clearFieldError("address");
            }}
            onBlur={onAddressBlur}
            placeholder="Street, city, country"
            rightIcon={
              <Pressable
                onPress={() => void locateFromAddress()}
                disabled={findingOnMap}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Find on map"
              >
                {findingOnMap ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.findOnMap}>Find on map</Text>
                )}
              </Pressable>
            }
          />
        </View>
        <Button
          label="Use my location"
          variant="secondary"
          size="sm"
          loading={locatingMe}
          onPress={() => void useCurrentLocation()}
          icon={<MapPin size={16} color={Colors.dark} />}
          style={styles.locationBtn}
        />

        <View onLayout={markFieldOffset("location")} style={styles.locationSection}>
          {Platform.OS === "web" ? (
            <View
              style={[
                styles.mapWebFallback,
                fieldErrors.location ? styles.mapWrapError : null,
              ]}
            >
              <View style={styles.labelErrorRow}>
                <Text style={styles.labelErrorText}>Location</Text>
                {fieldErrors.location ? (
                  <Text style={styles.inlineError}>{fieldErrors.location}</Text>
                ) : null}
              </View>
              <Text style={styles.mapWebFallbackText}>
                Interactive map pinning is available in the mobile app. We'll
                place the pin from the address you enter.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.labelErrorRow}>
                <Text style={styles.labelErrorText}>Location</Text>
                {fieldErrors.location ? (
                  <Text style={styles.inlineError}>{fieldErrors.location}</Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.mapWrap,
                  fieldErrors.location ? styles.mapWrapError : null,
                ]}
              >
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={mapInitialRegion}
              onPress={onMapPress}
              showsUserLocation
              showsMyLocationButton={false}
              toolbarEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              zoomEnabled
              scrollEnabled
              zoomTapEnabled
            >
              {coordsValid && coords ? (
                <Marker
                  coordinate={{ latitude: coords.lat, longitude: coords.lng }}
                  draggable
                  anchor={{ x: 0.5, y: 1 }}
                  onDragEnd={onPinDragEnd}
                >
                  <View
                    style={styles.pinCircle}
                    accessibilityLabel="Spot location pin"
                  >
                    <MapPin color="#fff" size={20} strokeWidth={2.4} />
                  </View>
                </Marker>
              ) : null}
            </MapView>
            <View style={styles.mapHintOverlay} pointerEvents="none">
              <Text style={styles.mapHintText}>
                {findingOnMap || locatingMe
                  ? "Finding that address…"
                  : coordsValid
                    ? "Tap elsewhere or drag the pin to fine‑tune."
                    : "Tap the map, find the address, or use your location."}
              </Text>
            </View>
              </View>
            </>
          )}
        </View>
      </>
    );
  } else if (step === 1) {
    stepBody = (
      <>
        <VibePicker
          label="Noise level"
          choices={NOISE_CHOICES}
          value={noiceLevel}
          onChange={setNoiceLevel}
        />
        <VibePicker
          label="Lighting"
          choices={LIGHTING_CHOICES}
          value={lighting}
          onChange={setLighting}
        />
        <VibePicker
          label="Tables & seating"
          choices={TABLES_CHOICES}
          value={tables}
          onChange={setTables}
        />
      </>
    );
  } else if (step === 2) {
    const amenityCount =
      Number(wifi) +
      Number(outlets) +
      Number(foodDrink) +
      Number(whiteboards) +
      Number(groupWork);
    stepBody = (
      <>
        <View style={styles.amenityRow}>
          <AmenityCard
            title="Wi-Fi"
            subtitle="Free and reliable"
            Icon={Wifi}
            selected={wifi}
            onToggle={() => setWifi((v) => !v)}
          />
          <AmenityCard
            title="Outlets"
            subtitle="Power at the tables"
            Icon={Plug}
            selected={outlets}
            onToggle={() => setOutlets((v) => !v)}
          />
        </View>
        <View style={styles.amenityRow}>
          <AmenityCard
            title="Food & drink"
            subtitle="Allowed inside"
            Icon={Coffee}
            selected={foodDrink}
            onToggle={() => setFoodDrink((v) => !v)}
          />
          <AmenityCard
            title="Whiteboards"
            subtitle="For working things out"
            Icon={Presentation}
            selected={whiteboards}
            onToggle={() => setWhiteboards((v) => !v)}
          />
        </View>
        <AmenityCard
          title="Group work friendly"
          wide
          subtitle="Talking won't get you shushed"
          Icon={Users}
          selected={groupWork}
          onToggle={() => setGroupWork((v) => !v)}
        />
        <Text style={styles.amenityCount}>
          {amenityCount} selected · leave anything you're unsure about off.
        </Text>
      </>
    );
  } else if (step === 3) {
    stepBody = (
      <>
        <SwitchRow
          label="Open 24 hours"
          value={is24Hours}
          onValueChange={(next) => {
            setIs24Hours(next);
            if (next) setHoursPicker(null);
          }}
        />
        {!is24Hours ? (
          <>
            <TimeSelectRow
              label="Opens"
              value={openTime}
              fallbackHour={8}
              open={Platform.OS === "ios" || hoursPicker === "open"}
              onToggle={() =>
                setHoursPicker((current) => (current === "open" ? null : "open"))
              }
              onChange={setOpenTime}
            />
            <TimeSelectRow
              label="Closes"
              value={closeTime}
              fallbackHour={22}
              open={Platform.OS === "ios" || hoursPicker === "close"}
              onToggle={() =>
                setHoursPicker((current) => (current === "close" ? null : "close"))
              }
              onChange={setCloseTime}
            />
          </>
        ) : null}
      </>
    );
  } else if (step === 4 && !isEdit) {
    stepBody = (
      <>
        <Text style={styles.fieldLabel}>Your rating</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
              <Star size={34} color={n <= rating ? Colors.accent : "#ccc"} fill={n <= rating ? Colors.accent : "transparent"} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
        <View onLayout={markFieldOffset("review")}>
          <Input
            label="First review"
            value={reviewContent}
            error={fieldErrors.review}
            onChangeText={(value) => {
              setReviewContent(value);
              if (value.trim().length >= 4) clearFieldError("review");
            }}
            multiline
            textAlignVertical="top"
            inputStyle={{ minHeight: 100 }}
            placeholder="Share what it's like to study here…"
            containerStyle={styles.fieldGap}
          />
        </View>
        <View onLayout={markFieldOffset("photos")} style={styles.fieldGap}>
          <View style={styles.labelErrorRow}>
            <Text style={styles.labelErrorText}>Photos ({images.length}/5)</Text>
            {fieldErrors.photos ? (
              <Text style={styles.inlineError}>{fieldErrors.photos}</Text>
            ) : null}
          </View>
          <Pressable
            style={[
              styles.addPhotoCard,
              fieldErrors.photos ? styles.addPhotoCardError : null,
            ]}
            onPress={() => void pickPhotos()}
          >
            <ImagePlus size={28} color={Colors.primary} strokeWidth={2} />
            <Text style={styles.addPhotoText}>Add photos</Text>
          </Pressable>
        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbScroll}>
            {images.map((a, i) => (
              <View key={a.assetId ?? `${a.uri}-${i}`} style={styles.thumbWrap}>
                <Image source={{ uri: a.uri }} style={styles.thumbImage} />
                <Pressable style={styles.thumbRemove} onPress={() => removePhoto(i)} hitSlop={8}>
                  <Text style={styles.thumbRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        </View>
      </>
    );
  }

  const stepKey = steps[step] ?? "Place";
  const copy = STEP_COPY[stepKey];
  const progress = (step + 1) / steps.length;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={goBackStep}
            disabled={loading}
            style={styles.backCircle}
            accessibilityRole="button"
            accessibilityLabel={step === 0 ? "Cancel" : "Back"}
          >
            <ArrowLeft size={20} color={Colors.dark} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isEdit ? "Edit spot" : "List a spot"}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <SmoothProgressBar progress={progress} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <FadeInUp replayKey={step}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
          {stepBody}
        </FadeInUp>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom - 16, 16) }]}
      >
        <View style={styles.footerBack}>
          <Button
            label={step === 0 ? "Cancel" : "Back"}
            variant="outline"
            fullWidth
            disabled={loading}
            onPress={goBackStep}
          />
        </View>
        <View style={styles.footerContinue}>
          <Button
            label={
              step === LAST_STEP_IDX
                ? isEdit
                  ? "Save changes"
                  : "Publish spot"
                : "Continue"
            }
            variant="default"
            fullWidth
            loading={loading}
            disabled={loading}
            onPress={goNext}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 10,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
    marginHorizontal: 12,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 24,
  },
  title: {
    fontSize: 32,
    fontFamily: Fonts.gabarito.bold,
    color: Colors.dark,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 16,
    color: "#666",
    marginBottom: 24,
    lineHeight: 22,
  },
  fieldGap: { marginTop: 16 },
  fieldBlock: { marginTop: 16 },
  fieldLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
  },
  vibeBlock: {
    marginBottom: 22,
  },
  vibeLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#8A8A8A",
    marginBottom: 10,
  },
  vibeTrack: {
    position: "relative",
    backgroundColor: "#EFEFEF",
    borderRadius: 18,
    paddingVertical: 4,
    overflow: "hidden",
  },
  vibeThumb: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  vibeRow: {
    flexDirection: "row",
    zIndex: 1,
  },
  vibeOption: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  vibeTileText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 11,
    color: "#9A9A9A",
  },
  vibeTileTextActive: {
    color: "#fff",
    fontFamily: Fonts.gabarito.semiBold,
  },
  vibeHint: {
    marginTop: 10,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "#8A8A8A",
  },
  amenityRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  amenityCardWrap: {
    flex: 1,
  },
  amenityCard: {
    position: "relative",
    flex: 1,
    backgroundColor: "#EFEFEF",
    borderRadius: 18,
    padding: 16,
    paddingRight: 28,
    borderWidth: 1.5,
    borderColor: "transparent",
    gap: 8,
  },
  amenityCardWide: {
    width: "100%",
    flexGrow: 0,
    marginBottom: 10,
  },
  amenityCardOn: {
    backgroundColor: "#fff",
    borderColor: Colors.primary,
  },
  amenityCardOff: {
    backgroundColor: "#EFEFEF",
  },
  amenityCheck: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  amenityTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  amenitySubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "#8A8A8A",
  },
  amenityMuted: {
    color: "#9A9A9A",
  },
  amenityCount: {
    marginTop: 6,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#8A8A8A",
  },
  findOnMap: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: Colors.primary,
  },
  locationBtn: {
    marginTop: 12,
    alignSelf: "stretch",
  },
  locationSection: {
    marginTop: 16,
  },
  labelErrorRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  labelErrorText: {
    flex: 1,
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
  },
  inlineError: {
    flexShrink: 1,
    maxWidth: "62%",
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "#DC2626",
    textAlign: "right",
  },
  mapWrap: {
    height: MAP_HEIGHT,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#EAEAEA",
  },
  mapWrapError: {
    borderColor: "#DC2626",
    borderWidth: 1.5,
  },
  mapHintOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  mapHintText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: Colors.dark,
    textAlign: "center",
    lineHeight: 17,
  },
  pinCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    elevation: 6,
  },
  mapWebFallback: {
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  mapWebFallbackText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    textAlign: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
  },
  switchLabel: {
    flex: 1,
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.dark,
    marginRight: 12,
  },
  timeBlock: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    overflow: "hidden",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  timeRowOpen: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  timeLabel: {
    flex: 1,
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.dark,
  },
  timeValue: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    color: Colors.dark,
  },
  timeValueOpen: {
    color: Colors.primary,
  },
  timePicker: {
    height: 196,
    marginTop: -8,
  },
  starsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  addPhotoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  addPhotoCardError: {
    borderColor: "#DC2626",
  },
  addPhotoText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.primary,
  },
  thumbScroll: { paddingVertical: 4, flexDirection: "row", flexWrap: "nowrap", alignItems: "center" },
  thumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#eee",
    marginRight: 10,
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemoveText: {
    color: "#fff",
    fontSize: 18,
    lineHeight: 20,
    fontFamily: Fonts.gabarito.bold,
    marginTop: -2,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 16,
    gap: 10,
    backgroundColor: Colors.light,
  },
  footerBack: {
    flex: 1,
  },
  footerContinue: {
    flex: 2,
  },
});
