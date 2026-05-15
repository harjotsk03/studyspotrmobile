import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowLeft, ArrowRightIcon, ImagePlus, MapPin, Star } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Input from "../components/Input";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { useAuth } from "../context/AuthContext";
import { type StudySpot, useSpots } from "../context/SpotsContext";
import type { SpotsStackParamList } from "./SpotDetailScreen";
import { createSpotMultipart, updateSpotMultipart } from "../utils/spotsApi";
import { getSpotCoordinates } from "../utils/getSpotCoordinates";
import { getSpotTitle } from "../utils/getSpotTitle";

const STEPS_CREATE = ["Place", "Atmosphere", "Amenities", "Hours", "Photos & review"] as const;
const STEPS_EDIT = ["Place", "Atmosphere", "Amenities", "Hours"] as const;

const MAP_HEIGHT = 220;
/** Default map framing (Toronto) before the user chooses a pin. */
const FALLBACK_LAT = 43.653226;
const FALLBACK_LNG = -79.383184;
const MAP_DELTA = { latitudeDelta: 0.014, longitudeDelta: 0.014 };

const NOICE_OPTIONS = ["Quiet", "Moderate", "Lively", "Variable"];
const LIGHTING_OPTIONS = ["Dim", "Moderate", "Bright"];
const TABLES_OPTIONS = ["Limited", "Enough", "Plenty"];

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

function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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

type WizardProps = NativeStackScreenProps<SpotsStackParamList, "CreateSpot" | "EditSpot">;

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

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

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
  };

  const mapInitialRegion = useMemo(
    () => ({
      latitude: FALLBACK_LAT,
      longitude: FALLBACK_LNG,
      ...MAP_DELTA,
    }),
    [],
  );

  const locateFromAddress = async () => {
    if (!address.trim()) {
      Alert.alert("Address needed", "Enter an address first.");
      return;
    }
    setGeocoding(true);
    try {
      const results = await Location.geocodeAsync(address.trim());
      if (!results?.length) {
        throw new Error("No results");
      }
      const lat = results[0].latitude;
      const lng = results[0].longitude;
      setCoords(lat, lng);
      animateMapTo(lat, lng);
    } catch {
      Alert.alert(
        "Could not geocode",
        "Try a fuller address, use your location, or enter latitude and longitude manually.",
      );
    } finally {
      setGeocoding(false);
    }
  };

  const useCurrentLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow location to place this spot.");
      return;
    }
    setGeocoding(true);
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords(lat, lng);
      animateMapTo(lat, lng);
      const rev = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });
      if (rev?.[0]) {
        const r = rev[0];
        const line =
          [r.streetNumber, r.street].filter(Boolean).join(" ") || r.name || r.district || "";
        const cityLine = [r.city, r.region].filter(Boolean).join(", ");
        const composed =
          line && cityLine ? `${line}, ${cityLine}` : line || cityLine || address;
        if (composed) setAddress(composed);
      }
    } catch {
      Alert.alert("Location error", "Could not read GPS. Try again or enter coordinates.");
    } finally {
      setGeocoding(false);
    }
  };

  const onMapPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    if (Platform.OS === "web") return;
    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
    setCoords(lat, lng);
    animateMapTo(lat, lng);
  };

  const onPinDragEnd = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
    setCoords(lat, lng);
  };

  const recenterFromInputsIfValid = () => {
    const parsed = parseCoordinates(latStr, lngStr);
    if (parsed) animateMapTo(parsed.lat, parsed.lng);
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
      if (!name.trim()) {
        Alert.alert("Name required", "Give this study spot a name.");
        return false;
      }
      if (!description.trim()) {
        Alert.alert("Description", "Add a short description.");
        return false;
      }
      if (!address.trim()) {
        Alert.alert("Address", "Where is this place?");
        return false;
      }
      if (!coordsValid) {
        Alert.alert(
          "Location coordinates",
          "Place a pin (tap map, GPS, match address), or enter valid latitude and longitude.",
        );
        return false;
      }
      return true;
    }
    if (s === 4 && !isEdit) {
      if (reviewContent.trim().length < 4) {
        Alert.alert("Review", "Write a few words for your first review.");
        return false;
      }
      if (images.length < 1) {
        Alert.alert("Photos", "Add at least one photo for the listing (API requires 1–5).");
        return false;
      }
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (step < LAST_STEP_IDX) setStep((x) => x + 1);
    else void submit();
  };

  const goBackStep = () => {
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
      open_time: openTime.trim(),
      close_time: closeTime.trim(),
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
      Alert.alert("Error", e instanceof Error ? e.message : isEdit ? "Could not update spot." : "Could not create spot.");
    } finally {
      setLoading(false);
    }
  };

  let stepBody: ReactNode = null;

  if (step === 0) {
    stepBody = (
      <>
        <Text style={styles.sectionHint}>
          Give the address, place a pin from your location or by tapping the map, then tweak by dragging.
        </Text>
        <Input label="Spot name" value={name} onChangeText={setName} placeholder="e.g. Robarts Library, 9th floor" />
        <Input
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          inputStyle={{ minHeight: 100 }}
          placeholder="What makes this a great place to study?"
          containerStyle={styles.fieldGap}
        />
        <Input label="Address" value={address} onChangeText={setAddress} placeholder="Street, city, country" containerStyle={styles.fieldGap} />
        <View style={styles.geoRow}>
          <Button label="Match address" variant="outline" size="sm" loading={geocoding} onPress={() => void locateFromAddress()} />
          <Button
            label="Use my location"
            variant="secondary"
            size="sm"
            loading={geocoding}
            onPress={() => void useCurrentLocation()}
            icon={<MapPin size={16} color={Colors.dark} />}
          />
        </View>

        {Platform.OS === "web" ? (
          <View style={styles.mapWebFallback}>
            <Text style={styles.mapWebFallbackText}>
              Interactive map pinning is available in the mobile app. Use latitude and longitude below to submit from web.
            </Text>
          </View>
        ) : (
          <View style={styles.mapWrap}>
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
                  <View style={styles.pinCircle} accessibilityLabel="Spot location pin">
                    <MapPin color="#fff" size={20} strokeWidth={2.4} />
                  </View>
                </Marker>
              ) : null}
            </MapView>
            <View style={styles.mapHintOverlay} pointerEvents="none">
              <Text style={styles.mapHintText}>
                {coordsValid ? "Tap elsewhere or drag the pin to fine‑tune." : "Tap the map to drop a pin, or use GPS / match address."}
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.coordsCaption}>Latitude & longitude</Text>
        <View style={styles.coordsInputs}>
          <View style={{ flex: 1 }}>
            <Input
              label="Latitude"
              value={latStr}
              onChangeText={setLatStr}
              placeholder="43.6598"
              keyboardType="numbers-and-punctuation"
              onBlur={recenterFromInputsIfValid}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Longitude"
              value={lngStr}
              onChangeText={setLngStr}
              placeholder="-79.3967"
              keyboardType="numbers-and-punctuation"
              onBlur={recenterFromInputsIfValid}
            />
          </View>
        </View>
        {coordsValid ? (
          <Text style={styles.coordsOk}>Location looks valid.</Text>
        ) : (
          <Text style={styles.coordsBad}>Enter valid coordinates (or geocode / GPS).</Text>
        )}
      </>
    );
  } else if (step === 1) {
    stepBody = (
      <>
        <Text style={styles.sectionHint}>Noise, lighting, and seating — the API field is spelled `noice_level`.</Text>
        <ChipRow label="Noise level" options={NOICE_OPTIONS} value={noiceLevel} onChange={setNoiceLevel} />
        <ChipRow label="Lighting" options={LIGHTING_OPTIONS} value={lighting} onChange={setLighting} />
        <ChipRow label="Tables / seating" options={TABLES_OPTIONS} value={tables} onChange={setTables} />
      </>
    );
  } else if (step === 2) {
    stepBody = (
      <>
        <Text style={styles.sectionHint}>What’s available while you study?</Text>
        <SwitchRow label="Food & drinks allowed" value={foodDrink} onValueChange={setFoodDrink} />
        <SwitchRow label="Wi‑Fi available" value={wifi} onValueChange={setWifi} />
        <SwitchRow label="Power outlets" value={outlets} onValueChange={setOutlets} />
        <SwitchRow label="Whiteboards" value={whiteboards} onValueChange={setWhiteboards} />
        <SwitchRow label="Group work friendly" value={groupWork} onValueChange={setGroupWork} />
      </>
    );
  } else if (step === 3) {
    stepBody = (
      <>
        <Text style={styles.sectionHint}>Use simple times like 08:00 — 22:00</Text>
        <Input label="Opens" value={openTime} onChangeText={setOpenTime} placeholder="08:00" />
        <Input label="Closes" value={closeTime} onChangeText={setCloseTime} placeholder="22:00" containerStyle={styles.fieldGap} />
      </>
    );
  } else if (step === 4 && !isEdit) {
    stepBody = (
      <>
        <Text style={styles.sectionHint}>
          Listings require 1–5 photos and your opening review — same multipart request as `createSpot` on the server.
        </Text>
        <Text style={styles.fieldLabel}>Your rating</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
              <Star size={34} color={n <= rating ? Colors.accent : "#ccc"} fill={n <= rating ? Colors.accent : "transparent"} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
        <Input
          label="First review"
          value={reviewContent}
          onChangeText={setReviewContent}
          multiline
          textAlignVertical="top"
          inputStyle={{ minHeight: 100 }}
          placeholder="Share what it's like to study here…"
          containerStyle={styles.fieldGap}
        />
        <Text style={styles.fieldLabel}>Photos ({images.length}/5)</Text>
        <Pressable style={styles.addPhotoCard} onPress={() => void pickPhotos()}>
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
      </>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.topBar}>
          <Pressable onPress={goBackStep} style={styles.iconCircle} hitSlop={10}>
            <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.topBarCenter}>
            <Text style={styles.screenTitle}>{isEdit ? "Edit spot" : "List a spot"}</Text>
            <Text style={styles.stepLine}>
              Step {step + 1} of {steps.length} · {steps[step] ?? ""}
            </Text>
          </View>
          <View style={styles.iconCirclePlaceholder} />
        </View>

        <View style={styles.progressRow}>
          {steps.map((_, i) => (
            <View key={String(i)} style={[styles.progressBar, i <= step ? styles.progressActive : styles.progressInactive]} />
          ))}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {stepBody}

          <View style={styles.buttonRow}>
            <Button
              label={step === 0 ? "Cancel" : "Back"}
              variant="accent"
              onPress={goBackStep}
              disabled={loading}
              style={styles.backButton}
            />
            <Button
              label={
                step === LAST_STEP_IDX ? (isEdit ? "Save changes" : "Publish spot") : "Next"
              }
              variant="default"
              loading={loading}
              icon={<ArrowRightIcon size={16} strokeWidth={3} color={Colors.light} />}
              iconPosition="right"
              onPress={goNext}
              style={styles.nextButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCirclePlaceholder: { width: 40, height: 40 },
  topBarCenter: { flex: 1, alignItems: "center" },
  screenTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 18,
    color: Colors.dark,
  },
  stepLine: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#777",
    marginTop: 2,
  },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  progressActive: { backgroundColor: Colors.accent },
  progressInactive: { backgroundColor: "#ddd" },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  sectionHint: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: "#666",
    marginBottom: 16,
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  chipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
  },
  chipText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 14,
    color: "#555",
  },
  chipTextActive: { color: Colors.dark },
  geoRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  mapWrap: {
    marginTop: 14,
    height: MAP_HEIGHT,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#EAEAEA",
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
  coordsCaption: {
    marginTop: 16,
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
  },
  coordsInputs: { flexDirection: "row", gap: 10, marginTop: 8 },
  coordsOk: {
    marginTop: 8,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: Colors.accent,
  },
  coordsBad: {
    marginTop: 8,
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#DC2626",
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
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
    marginBottom: 32,
  },
  backButton: { flex: 1 },
  nextButton: { flex: 2 },
});
