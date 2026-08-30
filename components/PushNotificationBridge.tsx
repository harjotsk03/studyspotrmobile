import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import {
  flushPendingPushNavigation,
  registerPushNotifications,
  subscribeToPushResponses,
  syncAppBadge,
} from "../utils/pushNotifications";

/** Registers the device for push once a session exists, and opens the
 * matching screen when a notification is tapped. */
export default function PushNotificationBridge() {
  const { token, profile, needsOnboarding } = useAuth();
  const { unreadCount } = useNotifications();

  useEffect(() => {
    return subscribeToPushResponses();
  }, []);

  useEffect(() => {
    if (!token) {
      void syncAppBadge(0);
      return;
    }
    void registerPushNotifications(token);
  }, [token]);

  useEffect(() => {
    if (!profile || needsOnboarding) {
      return;
    }
    flushPendingPushNavigation();
  }, [needsOnboarding, profile]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    void syncAppBadge(unreadCount);
  }, [profile, unreadCount]);

  return null;
}
