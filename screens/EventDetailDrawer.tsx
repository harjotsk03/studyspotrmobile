import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, Check, MapPin, Share2 } from "lucide-react-native";
import { Colors } from "../constants/Colors";
import { Fonts } from "../constants/Fonts";
import { API_BASE_URL } from "../constants/Api";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface Attendee {
  id: string;
  name: string;
  avatar_url?: string;
}

export type RsvpStatus = "going" | "pending" | null;

export interface CommunityEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  location?: string;
  attendee_count?: number;
  attendees?: Attendee[];
  user_rsvp_status?: RsvpStatus;
}

// ─── Shared Helper ────────────────────────────────────────────────────────────

export function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-US", { day: "2-digit" }),
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    time: d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    full: d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
}

// ─── Confetti particles ───────────────────────────────────────────────────────

const PARTICLE_COLORS = [
  Colors.primary,
  Colors.accent,
  "#16A34A",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
];

const PARTICLE_DIRS = [
  { x: -66, y: -50 },
  { x: 66, y: -50 },
  { x: -80, y: 4 },
  { x: 80, y: 4 },
  { x: -44, y: 56 },
  { x: 44, y: 56 },
];

// ─── RSVP Badge (self-animates on mount) ─────────────────────────────────────

function RsvpBadge({ type }: { type: "going" | "pending" }) {
  const scale = useRef(new Animated.Value(0)).current;
  const rotateProgress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(20)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entry animation — big overshoot bounce
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 5,
        stiffness: 380,
        mass: 0.55,
      }),
      Animated.spring(rotateProgress, {
        toValue: 1,
        useNativeDriver: true,
        damping: 6,
        stiffness: 240,
      }),
      Animated.spring(ty, {
        toValue: 0,
        useNativeDriver: true,
        damping: 9,
        stiffness: 260,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse ring fires slightly after the badge settles
    if (type === "going") {
      setTimeout(() => {
        pulseOpacity.setValue(0.5);
        pulseScale.setValue(0.85);
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 2.6,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]).start();
      }, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotate = rotateProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["-30deg", "0deg"],
    extrapolate: "extend",
  });

  const isGoing = type === "going";

  return (
    <View style={badgeStyles.wrapper}>
      {/* Green pulse ring — only for "going" */}
      {isGoing && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            badgeStyles.pulseRing,
            {
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />
      )}

      <Animated.View
        style={[
          badgeStyles.badge,
          isGoing ? badgeStyles.goingBg : badgeStyles.pendingBg,
          { opacity, transform: [{ scale }, { rotate }, { translateY: ty }] },
        ]}
      >
        {isGoing && (
          <View style={badgeStyles.checkCircle}>
            <Check size={12} color="#fff" strokeWidth={3} />
          </View>
        )}
        <Text
          style={[
            badgeStyles.text,
            isGoing ? badgeStyles.goingText : badgeStyles.pendingText,
          ]}
        >
          {isGoing ? "You\u2019re going!" : "Pending approval"}
        </Text>
      </Animated.View>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrapper: {
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  pulseRing: {
    borderRadius: 20,
    backgroundColor: "#16A34A",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  goingBg: { backgroundColor: "#DCFCE7" },
  pendingBg: { backgroundColor: "#FEF3C7" },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 13,
  },
  goingText: { color: "#16A34A" },
  pendingText: { color: "#92400E" },
});

// ─── Footer Button (custom animated press feel) ───────────────────────────────

interface FooterButtonProps {
  label: string;
  variant: "join" | "leave" | "cancel";
  onPress: () => void;
  loading?: boolean;
}

function FooterButton({
  label,
  variant,
  onPress,
  loading = false,
}: FooterButtonProps) {
  const pressScale = useRef(new Animated.Value(1)).current;

  const cfg = {
    join: { bg: Colors.primary, fg: "#fff", border: null },
    leave: { bg: "#FEF2F2", fg: "#DC2626", border: "#FECACA" },
    cancel: { bg: "#f8f9fa", fg: "#000000", border: "#000000" },
  }[variant];

  return (
    <Animated.View
      style={[footerBtnStyles.wrap, { transform: [{ scale: pressScale }] }]}
    >
      <Pressable
        style={[
          footerBtnStyles.btn,
          { backgroundColor: cfg.bg },
          cfg.border != null
            ? { borderWidth: 1.5, borderColor: cfg.border }
            : null,
        ]}
        onPressIn={() => {
          Animated.spring(pressScale, {
            toValue: 0.90,
            useNativeDriver: true,
            damping: 8,
            stiffness: 700,
            mass: 0.4,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressScale, {
            toValue: 1,
            useNativeDriver: true,
            damping: 5,
            stiffness: 280,
            mass: 0.55,
          }).start();
        }}
        onPress={onPress}
      >
        {loading ? (
          <ActivityIndicator color={cfg.fg} size="small" />
        ) : (
          <Text style={[footerBtnStyles.label, { color: cfg.fg }]}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const footerBtnStyles = StyleSheet.create({
  wrap: { flex: 1 },
  btn: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 16,
    letterSpacing: 0.2,
  },
});

// ─── Attendee Avatar ──────────────────────────────────────────────────────────

const AVATAR_SIZE = 40;

function AttendeeAvatar({
  attendee,
  index,
}: {
  attendee: Attendee;
  index: number;
}) {
  return (
    <View style={[styles.avatarCircle, index > 0 && styles.avatarOverlap]}>
      {attendee.avatar_url ? (
        <Image
          source={{ uri: attendee.avatar_url }}
          style={styles.avatarImage}
        />
      ) : (
        <Text style={styles.avatarInitial}>
          {attendee.name.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

// ─── EventDetailDrawer ────────────────────────────────────────────────────────

interface EventDetailDrawerProps {
  event: CommunityEvent | null;
  visible: boolean;
  onClose: () => void;
  communityId: string;
  token: string | null;
  onAttendanceChange?: (
    eventId: string,
    newCount: number,
    newStatus: RsvpStatus,
  ) => void;
}

export default function EventDetailDrawer({
  event,
  visible,
  onClose,
  communityId,
  token,
  onAttendanceChange,
}: EventDetailDrawerProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(800)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CommunityEvent | null>(null);

  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus>(null);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);

  // Confirm overlay
  const confirmScale = useRef(new Animated.Value(0.88)).current;
  const confirmOpacity = useRef(new Animated.Value(0)).current;

  // Footer slide transition
  const footerSlideY = useRef(new Animated.Value(0)).current;
  const footerFade = useRef(new Animated.Value(1)).current;

  // Count bounce
  const countBounce = useRef(new Animated.Value(1)).current;
  const prevCountRef = useRef<number | undefined>(undefined);
  const prevRsvpRef = useRef<RsvpStatus | undefined>(undefined);

  // Confetti particles
  const particles = useRef(
    PARTICLE_DIRS.map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    })),
  ).current;

  // ── Animation helpers ────────────────────────────────────────────────────

  const animateIn = useCallback(() => {
    translateY.setValue(800);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 200,
        mass: 0.9,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateY]);

  const animateOut = useCallback(
    (cb?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 800,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setModalVisible(false);
        setDetailEvent(null);
        cb?.();
      });
    },
    [backdropOpacity, translateY],
  );

  /**
   * Slides old button down + out, calls updateState (React re-renders),
   * then springs the new button up from below.
   */
  function animateFooterSwap(updateState: () => void) {
    Animated.parallel([
      Animated.timing(footerSlideY, {
        toValue: 28,
        duration: 110,
        useNativeDriver: true,
      }),
      Animated.timing(footerFade, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      updateState();
      footerSlideY.setValue(-22);
      Animated.parallel([
        Animated.spring(footerSlideY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 10,
          stiffness: 320,
          mass: 0.65,
        }),
        Animated.timing(footerFade, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }

  function burstParticles() {
    particles.forEach((p, i) => {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
      p.scale.setValue(1);
      const dir = PARTICLE_DIRS[i];
      Animated.parallel([
        Animated.spring(p.x, {
          toValue: dir.x,
          useNativeDriver: true,
          damping: 14,
          stiffness: 70,
        }),
        Animated.spring(p.y, {
          toValue: dir.y,
          useNativeDriver: true,
          damping: 14,
          stiffness: 70,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(p.scale, {
          toValue: 0.1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (visible && event) {
      prevRsvpRef.current = undefined;
      prevCountRef.current = undefined;
      footerFade.setValue(1);
      footerSlideY.setValue(0);
      countBounce.setValue(1);
      setDetailEvent(event);
      setRsvpStatus(event.user_rsvp_status ?? null);
      setAttendeeCount(event.attendee_count ?? 0);
      setModalVisible(true);
    }
  }, [visible, event, footerFade, footerSlideY, countBounce]);

  useEffect(() => {
    if (modalVisible) {
      animateIn();
      if (event?.id) void fetchDetail(event.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalVisible]);

  useEffect(() => {
    if (!visible && modalVisible) animateOut(onClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Count bounce when attendeeCount changes
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = attendeeCount;
    if (prev === undefined || prev === attendeeCount) return;
    const joining = attendeeCount > prev;
    countBounce.setValue(joining ? 1.65 : 0.6);
    Animated.spring(countBounce, {
      toValue: 1,
      useNativeDriver: true,
      damping: 5,
      stiffness: 240,
      mass: 0.5,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendeeCount]);

  // ── API calls ────────────────────────────────────────────────────────────

  async function fetchDetail(eventId: string) {
    if (!token) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/events/${eventId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const json = await res.json();
      if (res.ok) {
        const fetched: CommunityEvent = json.event ?? json;
        setDetailEvent((prev) => ({ ...prev, ...fetched }));
        setRsvpStatus(fetched.user_rsvp_status ?? null);
        setAttendeeCount(fetched.attendee_count ?? 0);
      }
    } catch {
      // keep snapshot data
    }
  }

  async function handleJoin() {
    if (!token || !detailEvent) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/events/${detailEvent.id}/join`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const json = await res.json();
      if (res.ok) {
        const newStatus: RsvpStatus =
          json.rsvp?.status ?? json.status ?? "going";
        const newCount =
          newStatus === "going" ? attendeeCount + 1 : attendeeCount;

        // Celebrate!
        burstParticles();

        animateFooterSwap(() => {
          setRsvpStatus(newStatus);
          setAttendeeCount(newCount);
          onAttendanceChange?.(detailEvent.id, newCount, newStatus);
          setActionLoading(false);
        });
      } else {
        setActionLoading(false);
      }
    } catch {
      setActionLoading(false);
    }
  }

  function openLeaveConfirm() {
    setLeaveConfirmVisible(true);
    confirmScale.setValue(0.88);
    confirmOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(confirmScale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 260,
        mass: 0.7,
      }),
      Animated.timing(confirmOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function closeLeaveConfirm(cb?: () => void) {
    Animated.parallel([
      Animated.timing(confirmScale, {
        toValue: 0.88,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(confirmOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setLeaveConfirmVisible(false);
      cb?.();
    });
  }

  async function handleLeave() {
    if (!token || !detailEvent) return;
    setActionLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/communities/${communityId}/events/${detailEvent.id}/leave`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      if (res.ok) {
        const newCount = Math.max(
          0,
          attendeeCount - (rsvpStatus === "going" ? 1 : 0),
        );
        animateFooterSwap(() => {
          setRsvpStatus(null);
          setAttendeeCount(newCount);
          onAttendanceChange?.(detailEvent.id, newCount, null);
          setActionLoading(false);
        });
      } else {
        setActionLoading(false);
      }
    } catch {
      setActionLoading(false);
    }
  }

  async function handleShare() {
    if (!detailEvent) return;
    try {
      await Share.share({
        title: detailEvent.title,
        message: `Check out "${detailEvent.title}" on StudySpotr!`,
      });
    } catch {
      // silent
    }
  }

  // ── Swipe-to-dismiss ─────────────────────────────────────────────────────

  const handleDismiss = useCallback(() => {
    animateOut(onClose);
  }, [animateOut, onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 6 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 140 || gs.vy > 0.6) {
          animateOut(onClose);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 22,
            stiffness: 200,
          }).start();
        }
      },
    }),
  ).current;

  // ── Render ───────────────────────────────────────────────────────────────

  if (!modalVisible || !detailEvent) return null;

  const { full, time } = formatDate(detailEvent.start_time);
  const endTime = detailEvent.end_time
    ? formatDate(detailEvent.end_time).time
    : null;
  const attendees = detailEvent.attendees ?? [];
  const visibleAvatars = attendees.slice(0, 3);

  const isgoing = rsvpStatus === "going";
  const isPending = rsvpStatus === "pending";

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="box-none"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Title */}
          <Text style={styles.eventTitle}>{detailEvent.title}</Text>

          {/* RSVP badge — self-animates on mount with bounce + pulse ring */}
          {isgoing && <RsvpBadge type="going" />}
          {isPending && <RsvpBadge type="pending" />}

          {/* Date & Time */}
          <View style={styles.infoBlock}>
            <View style={styles.infoIconBox}>
              <CalendarDays size={18} color={Colors.primary} strokeWidth={2} />
            </View>
            <View style={styles.infoTexts}>
              <Text style={styles.infoLabel}>Date & Time</Text>
              <Text style={styles.infoValue}>{full}</Text>
              <Text style={styles.infoValueSub}>
                {time}
                {endTime ? ` – ${endTime}` : ""}
              </Text>
            </View>
          </View>

          {/* Location */}
          {!!detailEvent.location && (
            <View style={styles.infoBlock}>
              <View style={styles.infoIconBox}>
                <MapPin size={18} color={Colors.primary} strokeWidth={2} />
              </View>
              <View style={styles.infoTexts}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{detailEvent.location}</Text>
              </View>
            </View>
          )}

          {/* Description */}
          {!!detailEvent.description && (
            <>
              <View style={styles.divider} />
              <View style={styles.descBlock}>
                <Text style={styles.sectionLabel}>About this event</Text>
                <Text style={styles.descText}>{detailEvent.description}</Text>
              </View>
            </>
          )}

          {/* Attendees */}
          {attendeeCount > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.attendeesBlock}>
                <Text style={styles.sectionLabel}>Who&apos;s going</Text>
                {visibleAvatars.length > 0 && (
                  <View style={styles.avatarsRow}>
                    {visibleAvatars.map((a, i) => (
                      <AttendeeAvatar key={a.id} attendee={a} index={i} />
                    ))}
                  </View>
                )}
                <Animated.Text
                  style={[
                    styles.attendeeCountText,
                    { transform: [{ scale: countBounce }] },
                  ]}
                >
                  {attendeeCount.toLocaleString()}{" "}
                  {attendeeCount === 1 ? "person" : "people"} going
                </Animated.Text>
              </View>
            </>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>

        {/* Fixed footer */}
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          {/* Particle burst layer */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {particles.map((p, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.particle,
                  { backgroundColor: PARTICLE_COLORS[i % PARTICLE_COLORS.length] },
                  {
                    opacity: p.opacity,
                    transform: [
                      { translateX: p.x },
                      { translateY: p.y },
                      { scale: p.scale },
                    ],
                  },
                ]}
              />
            ))}
          </View>

          {/* Animated button slot */}
          <Animated.View
            style={[
              styles.footerButtonWrap,
              {
                opacity: footerFade,
                transform: [{ translateY: footerSlideY }],
              },
            ]}
          >
            {isgoing ? (
              <FooterButton
                label="Leave Event"
                variant="leave"
                onPress={openLeaveConfirm}
                loading={actionLoading}
              />
            ) : isPending ? (
              <FooterButton
                label="Cancel Request"
                variant="cancel"
                onPress={openLeaveConfirm}
                loading={actionLoading}
              />
            ) : (
              <FooterButton
                label="Join Event"
                variant="join"
                onPress={() => void handleJoin()}
                loading={actionLoading}
              />
            )}
          </Animated.View>

          <TouchableOpacity
            style={styles.shareButton}
            activeOpacity={0.7}
            onPress={() => void handleShare()}
          >
            <Share2 size={20} color={Colors.dark} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Leave confirm overlay */}
      {leaveConfirmVisible && (
        <View style={styles.confirmBackdrop} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => closeLeaveConfirm()}
          />
          <Animated.View
            style={[
              styles.confirmCard,
              {
                opacity: confirmOpacity,
                transform: [{ scale: confirmScale }],
              },
            ]}
          >
            <Text style={styles.confirmTitle}>
              {isPending ? "Cancel your request?" : "Leave this event?"}
            </Text>
            <Text style={styles.confirmBody}>
              {isPending
                ? "Your request to attend will be withdrawn. You can request to join again later."
                : "You'll be removed from the attendee list. You can always rejoin later."}
            </Text>

            <View style={styles.confirmActions}>
              <FooterButton
                label="Keep spot"
                variant="cancel"
                onPress={() => closeLeaveConfirm()}
              />
              <FooterButton
                label={isPending ? "Cancel request" : "Leave event"}
                variant="leave"
                onPress={() =>
                  closeLeaveConfirm(() => {
                    void handleLeave();
                  })
                }
              />
            </View>
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  handleArea: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D0D0D0",
  },
  scrollContent: { flex: 1 },
  scrollContentContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  eventTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 22,
    color: Colors.dark,
    marginBottom: 12,
    lineHeight: 28,
  },
  // ── Info blocks ─────────────────────────────────────────────────────────
  infoBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 16,
  },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + "14",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  infoTexts: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 2,
  },
  infoLabel: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    color: "#AAA",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: Fonts.gabarito.semiBold,
    fontSize: 15,
    color: Colors.dark,
  },
  infoValueSub: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 16,
  },
  descBlock: { gap: 8 },
  sectionLabel: {
    fontFamily: Fonts.instrument.semiBold,
    fontSize: 11,
    color: "#AAA",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  descText: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  // ── Attendees ───────────────────────────────────────────────────────────
  attendeesBlock: { gap: 10 },
  avatarsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    overflow: "hidden",
  },
  avatarOverlap: { marginLeft: -10 },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitial: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 16,
    color: Colors.primary,
  },
  attendeeCountText: {
    fontFamily: Fonts.instrument.medium,
    fontSize: 14,
    color: "#666",
  },
  // ── Footer ──────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    overflow: "visible",
  },
  footerButtonWrap: { flex: 1 },
  particle: {
    position: "absolute",
    width: 11,
    height: 11,
    borderRadius: 6,
    left: "40%",
    top: "35%",
  },
  shareButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  // ── Leave confirm ────────────────────────────────────────────────────────
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  confirmCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  confirmTitle: {
    fontFamily: Fonts.gabarito.bold,
    fontSize: 20,
    color: Colors.dark,
    textAlign: "center",
    marginBottom: 8,
  },
  confirmBody: {
    fontFamily: Fonts.instrument.regular,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
});
