import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "./AuthContext";

const POLL_INTERVAL_MS = 3000;

export type NotificationActor = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  profile_photo?: string | null;
};

export type NotificationCommunity = {
  id: string;
  name?: string | null;
};

export type NotificationItem = {
  id: string;
  actor_user_id?: string | null;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  content?: string | null;
  created_at?: string | null;
  read_at?: string | null;
  actor?: NotificationActor | null;
  community?: NotificationCommunity | null;
  community_id?: string | null;
  metadata?: {
    community_id?: string | null;
    [key: string]: unknown;
  } | null;
};

type NotificationsResponse = {
  notifications?: NotificationItem[];
  unread_count?: number;
  error?: string;
};

type FetchMode = "initial" | "refresh" | "poll";

type NotificationsState = {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string;
  /**
   * Bumped whenever a new `accepted_to_community` notification is observed
   * for a given community while the app is running. Subscribers can watch the
   * version for their community id and refetch to stay in sync.
   */
  communityMembershipVersions: Record<string, number>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  respondToFriendRequest: (
    friendId: string,
    decision: "accept" | "reject",
  ) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsState | null>(null);

function getResponseError(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return fallback;
}

function getCommunityIdFromNotification(
  notification: NotificationItem,
): string | null {
  const candidate =
    notification.community?.id ??
    notification.community_id ??
    notification.metadata?.community_id ??
    null;
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [communityMembershipVersions, setCommunityMembershipVersions] =
    useState<Record<string, number>>({});
  const isFetchingRef = useRef(false);
  const seenMembershipNotificationIdsRef = useRef<Set<string>>(new Set());
  const hasSeededMembershipNotificationsRef = useRef(false);

  const fetchNotifications = useCallback(
    async (mode: FetchMode = "initial") => {
      if (!token || isFetchingRef.current) return;

      isFetchingRef.current = true;
      if (mode === "refresh") setRefreshing(true);
      else if (mode === "initial") setLoading(true);

      if (mode !== "poll") setError("");

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/notifications?limit=50&offset=0`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = (await res
          .json()
          .catch(() => null)) as NotificationsResponse | null;

        if (!res.ok) {
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }

        const list = Array.isArray(json?.notifications)
          ? json.notifications
          : [];
        setNotifications(list);
        setUnreadCount(
          typeof json?.unread_count === "number" ? json.unread_count : 0,
        );
        setError("");

        // Track membership-related notifications so subscribers can refetch
        // the affected community when they show up while the app is running.
        const membershipItems = list.filter(
          (item): item is NotificationItem =>
            !!item &&
            typeof item.id === "string" &&
            item.id.length > 0 &&
            item.type === "accepted_to_community",
        );

        if (!hasSeededMembershipNotificationsRef.current) {
          // First successful fetch: just remember which ones we've already
          // seen so we don't fire spurious refetches for old notifications.
          for (const item of membershipItems) {
            seenMembershipNotificationIdsRef.current.add(item.id);
          }
          hasSeededMembershipNotificationsRef.current = true;
        } else {
          const fresh = membershipItems.filter(
            (item) => !seenMembershipNotificationIdsRef.current.has(item.id),
          );
          if (fresh.length > 0) {
            const bumps: Record<string, number> = {};
            for (const item of fresh) {
              seenMembershipNotificationIdsRef.current.add(item.id);
              const cid = getCommunityIdFromNotification(item);
              if (cid) bumps[cid] = (bumps[cid] ?? 0) + 1;
            }
            if (Object.keys(bumps).length > 0) {
              setCommunityMembershipVersions((prev) => {
                const next = { ...prev };
                for (const cid of Object.keys(bumps)) {
                  next[cid] = (next[cid] ?? 0) + bumps[cid];
                }
                return next;
              });
            }
          }
        }
      } catch (err) {
        if (mode !== "poll") {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load notifications.",
          );
        }
      } finally {
        isFetchingRef.current = false;
        if (mode === "refresh") setRefreshing(false);
        else if (mode === "initial") setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setRefreshing(false);
      setError("");
      setCommunityMembershipVersions({});
      seenMembershipNotificationIdsRef.current = new Set();
      hasSeededMembershipNotificationsRef.current = false;
      return;
    }

    void fetchNotifications("initial");
    const intervalId = setInterval(() => {
      void fetchNotifications("poll");
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [fetchNotifications, token]);

  const refreshNotifications = useCallback(
    () => fetchNotifications("refresh"),
    [fetchNotifications],
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!token || !notificationId.trim()) return;

      const existing = notifications.find(
        (notification) => notification.id === notificationId,
      );

      if (existing?.read_at) return;

      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? { ...notification, read_at: readAt }
            : notification,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/notifications/${notificationId}/read`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            getResponseError(json, "Failed to mark notification as read."),
          );
        }
      } catch (err) {
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === notificationId
              ? { ...notification, read_at: existing?.read_at ?? null }
              : notification,
          ),
        );
        setUnreadCount((prev) => prev + 1);
        throw err;
      }
    },
    [notifications, token],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!token) return;

    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    const readAt = new Date().toISOString();

    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, read_at: readAt })),
    );
    setUnreadCount(0);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/notifications/read-all`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          getResponseError(json, "Failed to mark notifications as read."),
        );
      }
    } catch (err) {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      throw err;
    }
  }, [notifications, token, unreadCount]);

  const respondToFriendRequest = useCallback(
    async (friendId: string, decision: "accept" | "reject") => {
      if (!token || !friendId.trim()) return;

      const previousNotifications = notifications;
      const previousUnreadCount = unreadCount;

      setNotifications((prev) =>
        prev.filter(
          (notification) =>
            !(
              notification.type === "friend_request" &&
              (notification.actor?.id === friendId ||
                notification.actor_user_id === friendId)
            ),
        ),
      );
      setUnreadCount((prev) => {
        const removedUnreadCount = notifications.filter(
          (notification) =>
            notification.type === "friend_request" &&
            !notification.read_at &&
            (notification.actor?.id === friendId ||
              notification.actor_user_id === friendId),
        ).length;

        return Math.max(0, prev - removedUnreadCount);
      });

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/users/friend-requests/respond`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ friend_id: friendId, decision }),
          },
        );
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            getResponseError(json, "Failed to respond to friend request."),
          );
        }

        void fetchNotifications("refresh");
      } catch (err) {
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        throw err;
      }
    },
    [fetchNotifications, notifications, token, unreadCount],
  );

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refreshing,
        error,
        communityMembershipVersions,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        respondToFriendRequest,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider",
    );
  }

  return context;
}

/**
 * Returns a counter that is bumped whenever a new `accepted_to_community`
 * notification is observed for the given community while the app is open.
 * Subscribers can use this in a `useEffect` dependency array to silently
 * refetch community state.
 */
export function useCommunityMembershipVersion(
  communityId: string | undefined,
): number {
  const { communityMembershipVersions } = useNotifications();
  if (!communityId) return 0;
  return communityMembershipVersions[communityId] ?? 0;
}
