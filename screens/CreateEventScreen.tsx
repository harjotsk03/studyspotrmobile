import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
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
  GlobeIcon,
  LinkIcon,
  LockIcon,
  MapPinIcon,
  Users2Icon,
  FileTextIcon,
  TypeIcon,
  TagIcon,
} from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";
import Input from "../components/Input";
import type { CommunityStackParamList } from "./CommunityDetailScreen";

// ─── Constants ───────────────────────────────────────────────────────────────

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

type Props = NativeStackScreenProps<CommunityStackParamList, "CreateEvent">;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    hour12: true,
  });
}

function toISO(date: Date, time: Date): string {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined.toISOString();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({
  title,
  isOpen,
  onToggle,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={sectionStyles.header} onPress={onToggle}>
      <Text style={sectionStyles.title}>{title}</Text>
      <ChevronDown
        size={18}
        color="#888"
        strokeWidth={2}
        style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
      />
    </Pressable>
  );
}

function DateTimeField({
  label,
  icon,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={dtStyles.wrapper}>
      <Text style={dtStyles.label}>{label}</Text>
      <Pressable style={dtStyles.field} onPress={onPress}>
        <View style={dtStyles.iconWrap}>{icon}</View>
        <Text style={[dtStyles.value, !value && dtStyles.placeholder]}>
          {value ?? placeholder}
        </Text>
      </Pressable>
    </View>
  );
}

function ToggleRow({
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
    <View style={toggleRowStyles.row}>
      <View style={toggleRowStyles.text}>
        <Text style={toggleRowStyles.label}>{label}</Text>
        {!!description && (
          <Text style={toggleRowStyles.description}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#ddd", true: Colors.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CreateEventScreen({ route }: Props) {
  const { communityId, communityName } = route.params;
  const navigation =
    useNavigation<NativeStackNavigationProp<CommunityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  // Primary fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState("");

  // Type section
  const [typeOpen, setTypeOpen] = useState(true);
  const [eventType, setEventType] = useState<EventType>("other");

  // Date & Time section
  const [dateTimeOpen, setDateTimeOpen] = useState(true);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [startError, setStartError] = useState("");
  const [endError, setEndError] = useState("");

  // Location section
  const [locationOpen, setLocationOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [locationError, setLocationError] = useState("");

  // Attendance section
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [discoverableToAll, setDiscoverableToAll] = useState(true);
  const [rsvpOnly, setRsvpOnly] = useState(false);
  const [womenOnly, setWomenOnly] = useState(false);
  const [allowNonMembers, setAllowNonMembers] = useState(false);
  const [maxAttendees, setMaxAttendees] = useState("");

  // Date picker state
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [pickerValue, setPickerValue] = useState(new Date());

  const [loading, setLoading] = useState(false);

  // ── Section toggles ──────────────────────────────────────────────────────

  const toggle = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter((v) => !v);
  };

  // ── Date picker ──────────────────────────────────────────────────────────

  const openPicker = (target: PickerTarget) => {
    const mode: "date" | "time" = target.includes("Date") ? "date" : "time";
    const current =
      target === "startDate"
        ? startDate
        : target === "startTime"
          ? startTime
          : target === "endDate"
            ? endDate
            : endTime;
    setPickerValue(current ?? new Date());
    setPickerMode(mode);
    setPickerTarget(target);
  };

  const applyPickerValue = (date: Date) => {
    if (pickerTarget === "startDate") setStartDate(date);
    else if (pickerTarget === "startTime") setStartTime(date);
    else if (pickerTarget === "endDate") setEndDate(date);
    else if (pickerTarget === "endTime") setEndTime(date);
  };

  const onPickerChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setPickerValue(date);
  };

  // ── Validation ───────────────────────────────────────────────────────────

  const validate = (): boolean => {
    let valid = true;

    if (!title.trim()) {
      setTitleError("Title is required.");
      valid = false;
    } else if (title.trim().length > 80) {
      setTitleError("Title must be 80 characters or fewer.");
      valid = false;
    } else {
      setTitleError("");
    }

    if (!startDate || !startTime) {
      setStartError("Start date and time are required.");
      valid = false;
    } else {
      setStartError("");
    }

    if (endDate && endTime && startDate && startTime) {
      const s = new Date(toISO(startDate, startTime));
      const e = new Date(toISO(endDate, endTime));
      if (e <= s) {
        setEndError("End time must be after start time.");
        valid = false;
      } else {
        setEndError("");
      }
    } else {
      setEndError("");
    }

    if (isOnline && !meetingUrl.trim()) {
      setLocationError("Meeting URL is required for online events.");
      valid = false;
    } else if (!isOnline && !location.trim()) {
      setLocationError("Location is required for in-person events.");
      valid = false;
    } else {
      setLocationError("");
    }

    return valid;
  };

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!validate() || !token) return;

    const startISO = toISO(startDate!, startTime!);
    const endISO =
      endDate && endTime ? toISO(endDate, endTime) : undefined;

    const maxAttendeesNum = maxAttendees.trim()
      ? parseInt(maxAttendees.trim(), 10)
      : null;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/events/create-event`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || undefined,
            type: eventType,
            start_time: startISO,
            end_time: endISO,
            is_online: isOnline,
            location: isOnline ? undefined : location.trim(),
            meeting_url: isOnline ? meetingUrl.trim() : undefined,
            discoverable_to_all: discoverableToAll,
            rsvp_only: rsvpOnly,
            women_only: womenOnly,
            allow_non_members: allowNonMembers,
            max_attendees: maxAttendeesNum,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      Alert.alert("Event created!", `"${title.trim()}" is live.`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert(
        "Failed to create event",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={Colors.dark} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Create Event</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {communityName}
          </Text>
        </View>
        <View style={styles.iconButton} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          {/* ── Primary fields ────────────────────────────────────────── */}
          <View style={styles.card}>
            <Input
              label="Event Title"
              placeholder="e.g. Study Night at the Library"
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                if (titleError) setTitleError("");
              }}
              autoCapitalize="words"
              icon={<TypeIcon size={18} color="#999" />}
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
              icon={<FileTextIcon size={18} color="#999" />}
              containerStyle={styles.fieldGap}
              inputStyle={styles.textArea}
            />
          </View>

          {/* ── Event Type ────────────────────────────────────────────── */}
          <View style={styles.card}>
            <SectionHeader
              title="Event Type"
              isOpen={typeOpen}
              onToggle={() => toggle(setTypeOpen)}
            />
            {typeOpen && (
              <View style={styles.chipsGrid}>
                {EVENT_TYPES.map((t) => {
                  const selected = eventType === t;
                  return (
                    <Pressable
                      key={t}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setEventType(t)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── Date & Time ───────────────────────────────────────────── */}
          <View style={styles.card}>
            <SectionHeader
              title="Date & Time"
              isOpen={dateTimeOpen}
              onToggle={() => toggle(setDateTimeOpen)}
            />
            {dateTimeOpen && (
              <>
                <View style={styles.dateRow}>
                  <DateTimeField
                    label="Start Date *"
                    icon={<CalendarIcon size={16} color="#999" />}
                    value={startDate ? formatDate(startDate) : null}
                    placeholder="Select date"
                    onPress={() => openPicker("startDate")}
                  />
                  <DateTimeField
                    label="Start Time *"
                    icon={<ClockIcon size={16} color="#999" />}
                    value={startTime ? formatTime(startTime) : null}
                    placeholder="Select time"
                    onPress={() => openPicker("startTime")}
                  />
                </View>
                {!!startError && (
                  <Text style={styles.errorText}>{startError}</Text>
                )}

                <View style={[styles.dateRow, styles.fieldGap]}>
                  <DateTimeField
                    label="End Date"
                    icon={<CalendarIcon size={16} color="#999" />}
                    value={endDate ? formatDate(endDate) : null}
                    placeholder="Optional"
                    onPress={() => openPicker("endDate")}
                  />
                  <DateTimeField
                    label="End Time"
                    icon={<ClockIcon size={16} color="#999" />}
                    value={endTime ? formatTime(endTime) : null}
                    placeholder="Optional"
                    onPress={() => openPicker("endTime")}
                  />
                </View>
                {!!endError && (
                  <Text style={styles.errorText}>{endError}</Text>
                )}

                {/* Inline picker — no Modal, renders directly */}
                {pickerTarget !== null && (
                  <View style={pickerStyles.inlineCard}>
                    <View style={pickerStyles.inlineHeader}>
                      <Text style={pickerStyles.inlineLabel}>
                        {pickerTarget === "startDate"
                          ? "Start Date"
                          : pickerTarget === "startTime"
                            ? "Start Time"
                            : pickerTarget === "endDate"
                              ? "End Date"
                              : "End Time"}
                      </Text>
                      <View style={pickerStyles.inlineActions}>
                        <Pressable
                          onPress={() => setPickerTarget(null)}
                          style={pickerStyles.inlineBtn}
                        >
                          <Text style={pickerStyles.cancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            applyPickerValue(pickerValue);
                            setPickerTarget(null);
                          }}
                          style={[pickerStyles.inlineBtn, pickerStyles.doneBtn]}
                        >
                          <Text style={pickerStyles.doneText}>Done</Text>
                        </Pressable>
                      </View>
                    </View>
                    <DateTimePicker
                      value={pickerValue}
                      mode={pickerMode}
                      display="spinner"
                      onChange={onPickerChange}
                      style={pickerStyles.picker}
                    />
                  </View>
                )}
              </>
            )}
          </View>

          {/* ── Location ──────────────────────────────────────────────── */}
          <View style={styles.card}>
            <SectionHeader
              title="Location"
              isOpen={locationOpen}
              onToggle={() => toggle(setLocationOpen)}
            />
            {locationOpen && (
              <>
                <ToggleRow
                  label={isOnline ? "Online event" : "In-person event"}
                  description={
                    isOnline
                      ? "Share a meeting link with attendees"
                      : "Provide a physical location"
                  }
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
                      if (locationError) setLocationError("");
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
                      if (locationError) setLocationError("");
                    }}
                    autoCapitalize="words"
                    icon={<MapPinIcon size={18} color="#999" />}
                    error={locationError}
                    containerStyle={styles.fieldGap}
                  />
                )}
              </>
            )}
          </View>

          {/* ── Attendance & Rules ────────────────────────────────────── */}
          <View style={styles.card}>
            <SectionHeader
              title="Attendance & Rules"
              isOpen={attendanceOpen}
              onToggle={() => toggle(setAttendanceOpen)}
            />
            {attendanceOpen && (
              <>
                <ToggleRow
                  label="Discoverable to all"
                  description="Show this event to users outside the community"
                  value={discoverableToAll}
                  onValueChange={setDiscoverableToAll}
                />
                <ToggleRow
                  label="RSVP only"
                  description="Attendees must RSVP to join"
                  value={rsvpOnly}
                  onValueChange={setRsvpOnly}
                />
                <ToggleRow
                  label="Women only"
                  description="Restrict attendance to women"
                  value={womenOnly}
                  onValueChange={setWomenOnly}
                />
                <ToggleRow
                  label="Allow non-members"
                  description="Let people outside the community attend"
                  value={allowNonMembers}
                  onValueChange={setAllowNonMembers}
                />
                <Input
                  label="Max Attendees"
                  placeholder="Leave blank for unlimited"
                  value={maxAttendees}
                  onChangeText={(t) =>
                    setMaxAttendees(t.replace(/[^0-9]/g, ""))
                  }
                  keyboardType="number-pad"
                  icon={<Users2Icon size={18} color="#999" />}
                  containerStyle={styles.fieldGap}
                />
              </>
            )}
          </View>

          <Button
            label="Create Event"
            variant="default"
            loading={loading}
            onPress={handleCreate}
            style={styles.submitButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.light },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center", marginHorizontal: 12 },
  headerTitle: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 18,
    color: Colors.dark,
  },
  headerSubtitle: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 1,
  },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#eee",
    padding: 16,
    gap: 0,
  },
  fieldGap: { marginTop: 14 },
  textArea: { minHeight: 90, alignItems: "flex-start" },
  dateRow: { flexDirection: "row", gap: 10 },
  errorText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 12,
    color: "#DC2626",
    marginTop: 6,
  },
  chipsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#ddd",
    backgroundColor: Colors.light,
  },
  chipSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "18",
  },
  chipText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#555",
  },
  chipTextSelected: {
    color: Colors.dark,
    fontFamily: Fonts.gabarito.medium,
  },
  submitButton: { marginTop: 8 },
});

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 2,
  },
  title: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
});

const dtStyles = StyleSheet.create({
  wrapper: { flex: 1 },
  label: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 13,
    color: "#666",
    marginBottom: 6,
    marginLeft: 2,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  iconWrap: { opacity: 0.6 },
  value: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: Colors.dark,
    flex: 1,
  },
  placeholder: { color: "#999" },
});

const toggleRowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  text: { flex: 1, marginRight: 12 },
  label: {
    fontFamily: Fonts.gabarito.medium,
    fontSize: 15,
    color: Colors.dark,
  },
  description: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
});

const pickerStyles = StyleSheet.create({
  inlineCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    backgroundColor: "#fafafa",
    overflow: "hidden",
  },
  inlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
  },
  inlineLabel: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  inlineActions: {
    flexDirection: "row",
    gap: 8,
  },
  inlineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  doneBtn: {
    backgroundColor: Colors.primary,
  },
  cancelText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#888",
  },
  doneText: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 14,
    color: "#fff",
  },
  picker: {
    width: "100%",
    backgroundColor: "#fafafa",
  },
});
