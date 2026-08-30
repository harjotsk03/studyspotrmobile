import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { API_BASE_URL } from "../constants/Api";
import {
  openNotificationFromPush,
  parsePushPayload,
  type PushPayload,
} from "./openNotificationFromPush";
import { navigationRef } from "../navigation/rootNavigation";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let pendingPayload: PushPayload | null = null;
const handledResponseIds = new Set<string>();

function getEasProjectId() {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    null
  );
}

function isExpoPushToken(value: string) {
  return (
    value.startsWith("ExponentPushToken[") || value.startsWith("ExpoPushToken[")
  );
}

export function queueOrOpenPushPayload(data: unknown) {
  const payload = parsePushPayload(data);
  if (!payload) {
    return;
  }

  let routeNames: string[] | undefined;
  try {
    routeNames = navigationRef.isReady()
      ? navigationRef.getRootState()?.routeNames
      : undefined;
  } catch {
    routeNames = undefined;
  }
  if (routeNames?.includes("MainTabs")) {
    openNotificationFromPush(payload);
    return;
  }

  pendingPayload = payload;
}

export function flushPendingPushNavigation() {
  if (!pendingPayload || !navigationRef.isReady()) {
    return;
  }

  const payload = pendingPayload;
  pendingPayload = null;
  setTimeout(() => openNotificationFromPush(payload), 80);
}

function handleNotificationResponse(
  response: Notifications.NotificationResponse | null,
) {
  if (!response) {
    return;
  }

  const responseId = response.notification.request.identifier;
  if (handledResponseIds.has(responseId)) {
    return;
  }
  handledResponseIds.add(responseId);
  queueOrOpenPushPayload(response.notification.request.content.data);
}

export function subscribeToPushResponses() {
  const received = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse,
  );

  void Notifications.getLastNotificationResponseAsync().then(
    handleNotificationResponse,
  );

  return () => received.remove();
}

export async function requestPushPermission() {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    return status === "granted";
  } catch (error) {
    console.warn("Push permission request failed:", error);
    return false;
  }
}

export async function registerPushNotifications(accessToken: string) {
  if (!accessToken || Platform.OS === "web") {
    return null;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1A61A8",
      });
    }

    const granted = await requestPushPermission();
    if (!granted) {
      return null;
    }

    if (!Device.isDevice) {
      return "permission-granted";
    }

    const projectId = getEasProjectId();
    if (!projectId) {
      console.warn(
        "Push notifications: missing EAS projectId. Set extra.eas.projectId or EXPO_PUBLIC_EAS_PROJECT_ID.",
      );
      return "permission-granted";
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const expoPushToken = tokenResponse.data;
    if (!expoPushToken || !isExpoPushToken(expoPushToken)) {
      return "permission-granted";
    }

    const res = await fetch(`${API_BASE_URL}/api/v1/auth/push-token`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        token: expoPushToken,
        platform: Platform.OS,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.warn("Push token register failed:", body?.error || res.status);
      return "permission-granted";
    }

    return expoPushToken;
  } catch (error) {
    console.warn("Push registration skipped:", error);
    return null;
  }
}

export async function unregisterPushNotifications(accessToken: string) {
  if (!accessToken || Platform.OS === "web") {
    return;
  }

  try {
    const projectId = getEasProjectId();
    let expoPushToken: string | null = null;
    if (projectId && Device.isDevice) {
      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      expoPushToken = tokenResponse.data ?? null;
    }

    await fetch(`${API_BASE_URL}/api/v1/auth/push-token`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(
        expoPushToken ? { token: expoPushToken } : {},
      ),
    });
  } catch {
    // Logout should still complete if this request fails.
  }
}

export async function syncAppBadge(count: number) {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Badge updates are best-effort.
  }
}
