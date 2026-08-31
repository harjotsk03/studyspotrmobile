import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import {
  ArrowLeft,
  CalendarIcon,
  ChevronDown,
  ClockIcon,
  LinkIcon,
  MapPinIcon,
  Plus,
  TagIcon,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  fetchCommunityMembership,
  isCommunityAdminOrOwner,
} from "../utils/communityMembership";
import Button from "../components/Button";
import FadeInUp from "../components/FadeInUp";
import Input from "../components/Input";
import SmoothProgressBar from "../components/SmoothProgressBar";
import type { CommunityStackParamList } from "./CommunityDetailScreen";
import type { RootStackParamList } from "../types/navigation";

const STEPS_CREATE = ["Basics", "Type", "When", "Where", "Community"] as const;
const STEPS_EDIT = ["Basics", "Type", "When", "Where"] as const;

const STEP_COPY: Record<(typeof STEPS_CREATE)[number], { title: string; subtitle: string }> = {
  Basics: {
    title: "What's the event?",
    subtitle: "Give it a name and a short description.",
  },
  Type: {
    title: "What kind of event?",
    subtitle: "Tap everything that fits.",
  },
  When: {
    title: "When is it?",
    subtitle: "Set the start and end with the wheels.",
  },
  Where: {
    title: "Where is it?",
    subtitle: "In person or online — people need a place to show up.",
  },
  Community: {
    title: "Link a community?",
    subtitle: "Optional. You can publish this event on its own.",
  },
};

const EVENT_TYPES = [
  "study",
  "networking",
  "social",
  "workshop",
  "career",
  "wellness",
  "volunteering",
  "sports",
  "other",
] as const;

type EventType = (typeof EVENT_TYPES)[number];
type PickerTarget = "startDate" | "startTime" | "endDate" | "endTime";
type AdminCommunityOption = { id: string; name: string };
type Props = NativeStackScreenProps<CommunityStackParamList, "CreateEvent">;

function snapMinutes(date: Date): Date {
  const next = new Date(date);
  let hours = next.getHours();
  let minutes = Math.round(next.getMinutes() / 5) * 5;
  if (minutes === 60) {
    hours = (hours + 1) % 24;
    minutes = 0;
  }
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function defaultStart(): Date {
  return snapMinutes(new Date());
}

function defaultEnd(): Date {
  const next = defaultStart();
  next.setHours(next.getHours() + 2);
  return next;
}

function parseEventTypes(raw: string | undefined): { selected: string[]; custom: string[] } {
  const parts = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const selected: string[] = [];
  const custom: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (EVENT_TYPES.includes(lower as EventType)) {
      if (!selected.includes(lower)) selected.push(lower);
    } else {
      selected.push(part);
      if (!custom.some((c) => c.toLowerCase() === lower)) custom.push(part);
    }
  }
  return { selected, custom };
}

function applyDatePart(base: Date, picked: Date): Date {
  const next = new Date(base);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next;
}

function applyTimePart(base: Date, picked: Date): Date {
  const next = new Date(base);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return snapMinutes(next);
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDurationSummary(start: Date, end: Date) {
  const totalMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
  if (totalMinutes <= 0) return "End must be after start.";

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days} days ${hours} hours ${minutes} mins`;
}

function SwitchRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.switchLabel}>{label}</Text>
        {description ? (
          <Text style={styles.switchDescription}>{description}</Text>
        ) : null}
      </View>
      <Switch
        trackColor={{ false: "#ddd", true: Colors.accent }}
        thumbColor="#fff"
        value={value}
        onValueChange={onValueChange}
      />
    </View>
  );
}

function WheelField({
  label,
  icon,
  display,
  mode,
  value,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  display: string;
  mode: "date" | "time";
  value: Date;
  open: boolean;
  onToggle: () => void;
  onChange: (next: Date) => void;
}) {
  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      if (event.type === "dismissed") {
        onToggle();
        return;
      }
      if (date) onChange(date);
      onToggle();
      return;
    }
    if (date) onChange(date);
  };

  return (
    <View style={styles.timeBlock}>
      <Pressable
        onPress={onToggle}
        disabled={Platform.OS === "ios"}
        style={[styles.timeRow, open && styles.timeRowOpen]}
      >
        {icon}
        <Text style={styles.timeLabel}>{label}</Text>
        <Text style={[styles.timeValue, open && styles.timeValueOpen]}>{display}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={value}
          mode={mode}
          display="spinner"
          is24Hour={false}
          minuteInterval={mode === "time" ? 5 : undefined}
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

export default function CreateEventScreen({ route }: Props) {
  const editEvent = route.params?.event;
  const isEdit = Boolean(editEvent?.id);
  const prefillCommunityId =
    route.params?.communityId?.trim() ||
    (typeof editEvent?.community_id === "string" ? editEvent.community_id.trim() : "") ||
    "";
  const prefillCommunityName = route.params?.communityName?.trim() ?? "";
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { showToast } = useToast();

  const steps = isEdit ? STEPS_EDIT : STEPS_CREATE;
  const [step, setStep] = useState(0);
  const LAST_STEP_IDX = steps.length - 1;

  const [title, setTitle] = useState(editEvent?.title?.trim() ?? "");
  const [description, setDescription] = useState(editEvent?.description?.trim() ?? "");
  const [titleError, setTitleError] = useState("");

  const [linkToCommunity, setLinkToCommunity] = useState(Boolean(prefillCommunityId));
  const [linkedCommunityId, setLinkedCommunityId] = useState(prefillCommunityId);
  const [linkedCommunityName, setLinkedCommunityName] = useState(prefillCommunityName);
  const [communityError, setCommunityError] = useState("");
  const [communityPickerOpen, setCommunityPickerOpen] = useState(false);
  const [adminCommunities, setAdminCommunities] = useState<AdminCommunityOption[]>([]);

  const initialTypes = parseEventTypes(editEvent?.event_type);
  const [eventTypes, setEventTypes] = useState<string[]>(initialTypes.selected);
  const [customEventTypes, setCustomEventTypes] = useState<string[]>(initialTypes.custom);
  const [customEventTypeInput, setCustomEventTypeInput] = useState("");
  const [typeError, setTypeError] = useState("");
  const otherTypeAnim = useRef(new Animated.Value(0)).current;
  const isOtherTypeSelected = eventTypes.includes("other");

  const [startsAt, setStartsAt] = useState(() => {
    const raw = editEvent?.start_time ? new Date(editEvent.start_time) : null;
    return raw && !Number.isNaN(raw.getTime()) ? snapMinutes(raw) : defaultStart();
  });
  const [endsAt, setEndsAt] = useState(() => {
    const raw = editEvent?.end_time
      ? new Date(editEvent.end_time)
      : editEvent?.start_time
        ? new Date(editEvent.start_time)
        : null;
    if (raw && !Number.isNaN(raw.getTime())) {
      if (!editEvent?.end_time) raw.setHours(raw.getHours() + 2);
      return snapMinutes(raw);
    }
    return defaultEnd();
  });
  const [startError, setStartError] = useState("");
  const [endError, setEndError] = useState("");
  const [hoursPicker, setHoursPicker] = useState<PickerTarget | null>(null);

  const [isOnline, setIsOnline] = useState(Boolean(editEvent?.is_online));
  const [location, setLocation] = useState(editEvent?.location?.trim() ?? "");
  const [meetingUrl, setMeetingUrl] = useState(editEvent?.meeting_url?.trim() ?? "");
  const [locationError, setLocationError] = useState("");

  const [loading, setLoading] = useState(false);
  const durationSummary = useMemo(
    () => getDurationSummary(startsAt, endsAt),
    [startsAt, endsAt],
  );

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !loading });
  }, [loading, navigation]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/communities/?limit=200&offset=0`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok || cancelled || !json || typeof json !== "object") return;
        const raw = Array.isArray((json as { communities?: unknown[] }).communities)
          ? ((json as { communities?: unknown[] }).communities as unknown[])
          : [];
        const next: AdminCommunityOption[] = [];
        for (const item of raw) {
          if (!item || typeof item !== "object") continue;
          const obj = item as Record<string, unknown>;
          const id = typeof obj.id === "string" ? obj.id.trim() : "";
          const name = typeof obj.name === "string" ? obj.name.trim() : "";
          const role =
            typeof obj.user_role === "string" ? obj.user_role.toLowerCase() : "";
          if (!id || !name) continue;
          if (role !== "admin" && role !== "owner") continue;
          next.push({ id, name });
        }
        if (cancelled) return;
        setAdminCommunities(next);

        if (prefillCommunityId && prefillCommunityName && !linkedCommunityName) {
          setLinkedCommunityName(prefillCommunityName);
        }
      } catch {
        if (!cancelled) setAdminCommunities([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, prefillCommunityId, prefillCommunityName, linkedCommunityName]);

  useEffect(() => {
    Animated.timing(otherTypeAnim, {
      toValue: isOtherTypeSelected ? 1 : 0,
      duration: 240,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [isOtherTypeSelected, otherTypeAnim]);

  const toggleEventType = (t: string) => {
    setEventTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
    if (typeError) setTypeError("");
  };

  const addCustomEventType = () => {
    const trimmed = customEventTypeInput.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const duplicate =
      EVENT_TYPES.some((c) => c.toLowerCase() === lower) ||
      customEventTypes.some((c) => c.toLowerCase() === lower);
    if (duplicate) {
      setCustomEventTypeInput("");
      return;
    }
    setCustomEventTypes((prev) => [...prev, trimmed]);
    setEventTypes((prev) => [...prev, trimmed]);
    setCustomEventTypeInput("");
    if (typeError) setTypeError("");
  };

  const formatTypeLabel = (t: string) => {
    if (!t) return t;
    return EVENT_TYPES.includes(t as EventType)
      ? t.charAt(0).toUpperCase() + t.slice(1)
      : t;
  };

  const wheelOpen = useCallback(
    (target: PickerTarget) => Platform.OS === "ios" || hoursPicker === target,
    [hoursPicker],
  );

  const toggleWheel = (target: PickerTarget) => {
    setHoursPicker((current) => (current === target ? null : target));
  };

  const validateStep = (s: number): boolean => {
    if (s === 0) {
      if (!title.trim()) {
        setTitleError("Required");
        return false;
      }
      if (title.trim().length > 80) {
        setTitleError("80 characters or fewer");
        return false;
      }
      setTitleError("");
      return true;
    }
    if (s === 1) {
      if (eventTypes.length === 0) {
        setTypeError("Pick at least one type");
        return false;
      }
      setTypeError("");
      return true;
    }
    if (s === 2) {
      if (endsAt.getTime() <= startsAt.getTime()) {
        setEndError("End must be after start");
        setStartError("");
        return false;
      }
      setStartError("");
      setEndError("");
      return true;
    }
    if (s === 3) {
      if (isOnline && !meetingUrl.trim()) {
        setLocationError("Required");
        return false;
      }
      if (!isOnline && !location.trim()) {
        setLocationError("Required");
        return false;
      }
      setLocationError("");
      return true;
    }
    if (s === 4) {
      if (linkToCommunity && !linkedCommunityId) {
        setCommunityError("Choose a community or turn linking off.");
        return false;
      }
      setCommunityError("");
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (step < LAST_STEP_IDX) setStep((x) => x + 1);
    else void handleCreate();
  };

  const goBackStep = () => {
    if (loading) return;
    if (step > 0) setStep((x) => x - 1);
    else navigation.goBack();
  };

  const openEventOnCommunityHome = (eventId: string) => {
    const params = { openEventId: eventId, openEventNonce: Date.now() };
    const names = navigation.getState()?.routeNames ?? [];
    if (names.includes("CommunityList")) {
      navigation.navigate("CommunityList", params);
      return;
    }
    (
      navigation as unknown as NativeStackNavigationProp<RootStackParamList>
    ).navigate("MainTabs", {
      screen: "Community",
      params: { screen: "CommunityList", params },
    });
  };

  const handleCreate = async () => {
    if (!token) return;
    if (!validateStep(step)) return;

    if (!isEdit && linkToCommunity && linkedCommunityId) {
      try {
        const membership = await fetchCommunityMembership(token, linkedCommunityId);
        if (!(membership.is_member && isCommunityAdminOrOwner(membership))) {
          Alert.alert(
            "Access changed",
            membership.is_member
              ? "You no longer have permission to link events to this community."
              : "You are no longer a member of this community.",
          );
          return;
        }
      } catch {
        // Allow submit if membership refresh fails; backend will enforce.
      }
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      type: eventTypes.join(", "),
      start_time: startsAt.toISOString(),
      end_time: endsAt.toISOString(),
      is_online: isOnline,
      location: isOnline ? undefined : location.trim(),
      meeting_url: isOnline ? meetingUrl.trim() : undefined,
    };

    setLoading(true);
    try {
      if (isEdit && editEvent?.id) {
        const res = await fetch(`${API_BASE_URL}/api/v1/events/${editEvent.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        showToast("Event updated");
        openEventOnCommunityHome(editEvent.id);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/events/create-event`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...payload,
          community_id: linkToCommunity ? linkedCommunityId : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const createdEventId =
        json.event?.id ?? json.event_id ?? json.id ?? json.event?.event_id;

      showToast("Event created");

      if (!createdEventId || typeof createdEventId !== "string") {
        navigation.goBack();
        return;
      }

      openEventOnCommunityHome(createdEventId);
    } catch (err) {
      Alert.alert(
        isEdit ? "Failed to update event" : "Failed to create event",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const stepKey = steps[step] ?? "Basics";
  const copy = STEP_COPY[stepKey];
  const progress = (step + 1) / steps.length;

  let stepBody = null;
  if (step === 0) {
    stepBody = (
      <>
        <Input
          label="Event title"
          placeholder="e.g. Study Night at the Library"
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            if (t.trim()) setTitleError("");
          }}
          autoCapitalize="words"
          error={titleError}
        />
        <Input
          label="Description"
          placeholder="Tell people what to expect…"
          value={description}
          onChangeText={setDescription}
          autoCapitalize="sentences"
          multiline
          numberOfLines={4}
          containerStyle={styles.fieldGap}
          inputStyle={styles.textArea}
        />
      </>
    );
  } else if (step === 1) {
    stepBody = (
      <>
        <View style={styles.chipsGrid}>
          {EVENT_TYPES.filter((t) => t !== "other").map((t) => {
            const selected = eventTypes.includes(t);
            return (
              <Pressable
                key={t}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => toggleEventType(t)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {formatTypeLabel(t)}
                </Text>
              </Pressable>
            );
          })}
          {customEventTypes.map((t) => {
            const selected = eventTypes.includes(t);
            return (
              <Pressable
                key={`custom:${t}`}
                style={[
                  styles.chip,
                  selected && styles.chipSelected,
                  !selected && styles.chipCustomDisabled,
                ]}
                onPress={() => toggleEventType(t)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {formatTypeLabel(t)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            key="other"
            style={[styles.chip, isOtherTypeSelected && styles.chipSelected]}
            onPress={() => toggleEventType("other")}
          >
            <Text
              style={[styles.chipText, isOtherTypeSelected && styles.chipTextSelected]}
            >
              Other
            </Text>
          </Pressable>
        </View>
        <Animated.View
          pointerEvents={isOtherTypeSelected ? "auto" : "none"}
          style={{
            opacity: otherTypeAnim,
            transform: [
              {
                translateY: otherTypeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 0],
                }),
              },
            ],
            height: otherTypeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 56],
            }),
            overflow: "hidden",
          }}
        >
          <View style={styles.customTypeRow}>
            <TextInput
              style={styles.customTypeInput}
              value={customEventTypeInput}
              onChangeText={setCustomEventTypeInput}
              placeholder="Add your own event type"
              placeholderTextColor="#999"
              returnKeyType="done"
              autoCapitalize="words"
              onSubmitEditing={addCustomEventType}
              editable={isOtherTypeSelected}
            />
            <Pressable
              style={({ pressed }) => [
                styles.customTypeAddBtn,
                !customEventTypeInput.trim() && styles.customTypeAddBtnDisabled,
                pressed && styles.customTypeAddBtnPressed,
              ]}
              disabled={!customEventTypeInput.trim()}
              onPress={addCustomEventType}
              accessibilityRole="button"
              accessibilityLabel="Add custom event type"
            >
              <Plus size={20} color="#fff" strokeWidth={2.6} />
            </Pressable>
          </View>
        </Animated.View>
        {typeError ? <Text style={styles.errorText}>{typeError}</Text> : null}
      </>
    );
  } else if (step === 2) {
    stepBody = (
      <>
        <Text style={styles.groupLabel}>Starts</Text>
        <WheelField
          label="Date"
          icon={
            <CalendarIcon
              size={18}
              color={wheelOpen("startDate") ? Colors.primary : "#999"}
              strokeWidth={2.1}
            />
          }
          display={formatDate(startsAt)}
          mode="date"
          value={startsAt}
          open={wheelOpen("startDate")}
          onToggle={() => toggleWheel("startDate")}
          onChange={(picked) => {
            setStartsAt((current) => applyDatePart(current, picked));
            if (startError) setStartError("");
          }}
        />
        <WheelField
          label="Time"
          icon={
            <ClockIcon
              size={18}
              color={wheelOpen("startTime") ? Colors.primary : "#999"}
              strokeWidth={2.1}
            />
          }
          display={formatTime(startsAt)}
          mode="time"
          value={startsAt}
          open={wheelOpen("startTime")}
          onToggle={() => toggleWheel("startTime")}
          onChange={(picked) => {
            setStartsAt((current) => applyTimePart(current, picked));
            if (startError) setStartError("");
          }}
        />
        {startError ? <Text style={styles.errorText}>{startError}</Text> : null}

        <Text style={[styles.groupLabel, styles.groupLabelSpaced]}>Ends</Text>
        <WheelField
          label="Date"
          icon={
            <CalendarIcon
              size={18}
              color={wheelOpen("endDate") ? Colors.primary : "#999"}
              strokeWidth={2.1}
            />
          }
          display={formatDate(endsAt)}
          mode="date"
          value={endsAt}
          open={wheelOpen("endDate")}
          onToggle={() => toggleWheel("endDate")}
          onChange={(picked) => {
            setEndsAt((current) => applyDatePart(current, picked));
            if (endError) setEndError("");
          }}
        />
        <WheelField
          label="Time"
          icon={
            <ClockIcon
              size={18}
              color={wheelOpen("endTime") ? Colors.primary : "#999"}
              strokeWidth={2.1}
            />
          }
          display={formatTime(endsAt)}
          mode="time"
          value={endsAt}
          open={wheelOpen("endTime")}
          onToggle={() => toggleWheel("endTime")}
          onChange={(picked) => {
            setEndsAt((current) => applyTimePart(current, picked));
            if (endError) setEndError("");
          }}
        />
        <View style={styles.durationCard}>
          <Text style={styles.durationLabel}>Duration</Text>
          <Text
            style={[
              styles.durationValue,
              durationSummary === "End must be after start." && styles.durationError,
            ]}
          >
            {durationSummary}
          </Text>
        </View>
        {endError ? <Text style={styles.errorText}>{endError}</Text> : null}
      </>
    );
  } else if (step === 3) {
    stepBody = (
      <>
        <SwitchRow
          label="Online event"
          value={isOnline}
          onValueChange={(v) => {
            setIsOnline(v);
            setLocationError("");
          }}
        />
        {isOnline ? (
          <Input
            label="Meeting URL"
            placeholder="https://meet.google.com/…"
            value={meetingUrl}
            onChangeText={(t) => {
              setMeetingUrl(t);
              if (t.trim()) setLocationError("");
            }}
            autoCapitalize="none"
            keyboardType="url"
            icon={<LinkIcon size={18} color="#999" />}
            error={locationError}
            containerStyle={styles.fieldGap}
          />
        ) : (
          <Input
            label="Location"
            placeholder="e.g. Koerner Library, UBC"
            value={location}
            onChangeText={(t) => {
              setLocation(t);
              if (t.trim()) setLocationError("");
            }}
            autoCapitalize="words"
            icon={<MapPinIcon size={18} color="#999" />}
            error={locationError}
            containerStyle={styles.fieldGap}
          />
        )}
      </>
    );
  } else {
    stepBody = (
      <>
        <SwitchRow
          label="Link to a community"
          description="Only communities you admin can be linked."
          value={linkToCommunity}
          onValueChange={(v) => {
            setLinkToCommunity(v);
            if (!v) {
              setLinkedCommunityId("");
              setLinkedCommunityName("");
              setCommunityError("");
            }
          }}
        />
        {linkToCommunity ? (
          <View style={styles.fieldGap}>
            <Text style={styles.selectLabel}>Community</Text>
            <Pressable
              style={[
                styles.selectField,
                communityError ? styles.selectFieldError : null,
              ]}
              onPress={() => setCommunityPickerOpen(true)}
            >
              <TagIcon size={16} color="#999" />
              <Text
                style={[
                  styles.selectValue,
                  !linkedCommunityName && styles.selectPlaceholder,
                ]}
              >
                {linkedCommunityName || "Choose one of your admin communities"}
              </Text>
              <ChevronDown size={16} color="#999" />
            </Pressable>
            {communityError ? (
              <Text style={styles.errorText}>{communityError}</Text>
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

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
            {isEdit ? "Edit event" : "Create event"}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <SmoothProgressBar progress={progress} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeInUp replayKey={step}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
          {stepBody}
        </FadeInUp>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom - 16, 16) }]}>
        <View style={styles.footerBack}>
          <Button
            label={step === 0 ? "Cancel" : "Back"}
            variant="outline"
            fullWidth
            onPress={goBackStep}
          />
        </View>
        <View style={styles.footerContinue}>
          <Button
            label={
              step === LAST_STEP_IDX
                ? isEdit
                  ? "Save changes"
                  : "Create event"
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

      <Pressable
        style={[styles.modalRoot, !communityPickerOpen && styles.modalHidden]}
        pointerEvents={communityPickerOpen ? "auto" : "none"}
        onPress={() => setCommunityPickerOpen(false)}
      >
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>Link to community</Text>
          <Text style={styles.modalBody}>
            Select one of your communities where you are admin/owner.
          </Text>
          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {adminCommunities.length === 0 ? (
              <Text style={styles.modalEmpty}>No admin communities available.</Text>
            ) : (
              adminCommunities.map((community) => {
                const selected = community.id === linkedCommunityId;
                return (
                  <Pressable
                    key={community.id}
                    style={[styles.modalOption, selected && styles.modalOptionSelected]}
                    onPress={() => {
                      setLinkedCommunityId(community.id);
                      setLinkedCommunityName(community.name);
                      setCommunityError("");
                      setCommunityPickerOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        selected && styles.modalOptionTextSelected,
                      ]}
                    >
                      {community.name}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
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
  textArea: { minHeight: 90, alignItems: "flex-start" },
  chipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#fff",
  },
  chipText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#555",
  },
  chipTextSelected: {
    color: Colors.primary,
    fontFamily: Fonts.gabarito.medium,
  },
  chipCustomDisabled: {
    opacity: 0.55,
  },
  customTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  customTypeInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: Colors.dark,
  },
  customTypeAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  customTypeAddBtnDisabled: {
    backgroundColor: "#ccc",
  },
  customTypeAddBtnPressed: {
    opacity: 0.8,
  },
  groupLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#8A8A8A",
    marginBottom: 10,
  },
  groupLabelSpaced: {
    marginTop: 22,
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
  durationCard: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  durationLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 12,
    color: "#777",
    marginBottom: 2,
  },
  durationValue: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  durationError: {
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
  },
  switchText: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.dark,
  },
  switchDescription: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  selectLabel: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
    marginBottom: 6,
    marginLeft: 2,
  },
  selectField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectFieldError: {
    borderColor: "#DC2626",
    borderWidth: 1.5,
  },
  selectValue: {
    flex: 1,
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: Colors.dark,
  },
  selectPlaceholder: {
    color: "#999",
  },
  errorText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#DC2626",
    marginTop: 8,
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
  modalRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    zIndex: 30,
  },
  modalHidden: {
    display: "none",
  },
  modalCard: {
    width: "100%",
    maxHeight: "70%",
    borderRadius: 20,
    backgroundColor: "#fff",
    padding: 20,
  },
  modalTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.dark,
    textAlign: "center",
  },
  modalBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#777",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  modalList: {
    marginHorizontal: -4,
  },
  modalOption: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalOptionSelected: {
    backgroundColor: Colors.primary + "12",
  },
  modalOptionText: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.dark,
  },
  modalOptionTextSelected: {
    color: Colors.primary,
  },
  modalEmpty: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    paddingVertical: 14,
  },
});
