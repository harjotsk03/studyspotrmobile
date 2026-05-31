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
import type {
  NotificationActor,
  NotificationItem,
} from "./NotificationsContext";

/**
 * Polling cadence for the feed-interactions notification feed. The header on
 * `FeedScreen` and the `FeedInteractionsScreen` itself both read from this
 * context, so a single interval keeps them in lock-step without each
 * surface running its own timer.
 */
const POLL_INTERVAL_MS = 5000;

/**
 * The subset of notification types the dedicated backend endpoint returns.
 * Exported so screens can render type-aware copy without sprinkling string
 * literals everywhere.
 */
export type FeedInteractionType =
  | "liked_your_post"
  | "liked_your_comment"
  | "commented_on_your_post"
  | "replied_to_your_comment";

/**
 * Feed-interaction notifications reuse the standard `NotificationItem` shape
 * but always carry the relevant feed ids in `metadata` so the row can
 * navigate the user to the right post / comment on tap.
 */
export type FeedInteractionMetadata = {
  post_id?: string | null;
  comment_id?: string | null;
  parent_comment_id?: string | null;
};

export type FeedInteractionNotification = Omit<NotificationItem, "metadata"> & {
  type?: FeedInteractionType | string | null;
  metadata?: (FeedInteractionMetadata & { [key: string]: unknown }) | null;
};

type FeedInteractionsResponse = {
  notifications?: FeedInteractionNotification[];
  unread_count?: number;
  error?: string;
};

type FetchMode = "initial" | "refresh" | "poll";

type FeedInteractionsState = {
  notifications: FeedInteractionNotification[];
  unreadCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string;
  refresh: () => Promise<void>;
  /** Optimistically mark every currently-loaded unread row as read on the
   * backend in parallel. Used when the user opens the dedicated screen. */
  markAllRead: () => Promise<void>;
  /** Soft-delete (sets `deleted = true`). Optimistic: rolls back on error. */
  remove: (notificationId: string) => Promise<void>;
  /** Counterpart to `remove`. Re-inserts the original snapshot and PATCHes
   * `deleted = false` so an Undo toast can roll back a stray swipe. */
  restore: (notification: FeedInteractionNotification) => Promise<void>;
};

const FeedInteractionsContext = createContext<FeedInteractionsState | null>(
  null,
);

export type { NotificationActor };

export function FeedInteractionsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<
    FeedInteractionNotification[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const isFetchingRef = useRef(false);
  const stateRef = useRef({
    notifications,
    unreadCount,
  });

  // Mirror latest state into a ref so callbacks can read it without
  // re-binding on every render (and without bloating dep arrays).
  useEffect(() => {
    stateRef.current = { notifications, unreadCount };
  }, [notifications, unreadCount]);

  const fetchInteractions = useCallback(
    async (mode: FetchMode = "initial") => {
      if (!token || isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (mode === "refresh") setRefreshing(true);
      else if (mode === "initial") setLoading(true);
      if (mode !== "poll") setError("");

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/notifications/feed-interactions?limit=50&offset=0`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const json = (await res
          .json()
          .catch(() => null)) as FeedInteractionsResponse | null;
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

        const list = Array.isArray(json?.notifications)
          ? json.notifications
          : [];
        setNotifications(list);
        setUnreadCount(
          typeof json?.unread_count === "number"
            ? json.unread_count
            : list.filter((n) => !n.read_at).length,
        );
        setError("");
      } catch (err) {
        // Silent polling errors so a flaky network doesn't blink an error
        // banner over the feed every 5 seconds.
        if (mode !== "poll") {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load feed activity.",
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

  // Initial load + interval polling. Disposed cleanly when the auth token
  // changes (logout) so we never poll with stale credentials.
  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setRefreshing(false);
      setError("");
      return;
    }

    void fetchInteractions("initial");
    const intervalId = setInterval(() => {
      void fetchInteractions("poll");
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchInteractions, token]);

  const refresh = useCallback(
    () => fetchInteractions("refresh"),
    [fetchInteractions],
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    const snapshot = stateRef.current.notifications;
    const previousUnread = stateRef.current.unreadCount;
    const unreadIds = snapshot
      .filter((n) => !n.read_at)
      .map((n) => n.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (unreadIds.length === 0) return;

    // Optimistic local update first so the badge clears instantly when the
    // screen mounts; the network round-trips run in parallel below.
    const readAt = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) =>
        unreadIds.includes(n.id) ? { ...n, read_at: readAt } : n,
      ),
    );
    setUnreadCount(0);

    try {
      await Promise.all(
        unreadIds.map(async (id) => {
          const res = await fetch(
            `${API_BASE_URL}/api/v1/notifications/${id}/read`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
            },
          );
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
        }),
      );
    } catch (err) {
      // Best-effort: if some succeeded and others failed we'll re-converge
      // on the next poll. Roll back the optimistic unread-count update
      // only — keep the rows visually read so the user isn't surprised by
      // a partial revert.
      setUnreadCount(previousUnread);
      throw err;
    }
  }, [token]);

  const remove = useCallback(
    async (notificationId: string) => {
      if (!token || !notificationId) return;
      const previous = stateRef.current.notifications;
      const previousUnread = stateRef.current.unreadCount;
      const target = previous.find((n) => n.id === notificationId);
      const wasUnread = Boolean(target && !target.read_at);

      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/notifications/${notificationId}/delete`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        setNotifications(previous);
        setUnreadCount(previousUnread);
        throw err;
      }
    },
    [token],
  );

  const restore = useCallback(
    async (notification: FeedInteractionNotification) => {
      if (!token || !notification?.id) return;
      const previous = stateRef.current.notifications;
      const previousUnread = stateRef.current.unreadCount;
      const wasUnread = !notification.read_at;

      setNotifications((prev) => {
        const withoutDuplicate = prev.filter((n) => n.id !== notification.id);
        const next = [notification, ...withoutDuplicate];
        next.sort((a, b) => {
          const at = new Date(a.created_at ?? 0).getTime();
          const bt = new Date(b.created_at ?? 0).getTime();
          return bt - at;
        });
        return next;
      });
      if (wasUnread) setUnreadCount((prev) => prev + 1);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/notifications/${notification.id}/restore`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        setNotifications(previous);
        setUnreadCount(previousUnread);
        throw err;
      }
    },
    [token],
  );

  return (
    <FeedInteractionsContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refreshing,
        error,
        refresh,
        markAllRead,
        remove,
        restore,
      }}
    >
      {children}
    </FeedInteractionsContext.Provider>
  );
}

export function useFeedInteractions(): FeedInteractionsState {
  const ctx = useContext(FeedInteractionsContext);
  if (!ctx) {
    throw new Error(
      "useFeedInteractions must be used within a FeedInteractionsProvider",
    );
  }
  return ctx;
}
