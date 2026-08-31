import { CommonActions } from "@react-navigation/native";
import { Colors } from "../constants/Colors";
import { navigationRef } from "../navigation/rootNavigation";

export type PushPayload = {
  kind?: string;
  type?: string;
  notificationId?: string;
  actorUserId?: string;
  communityId?: string;
  communityName?: string;
  eventId?: string;
  conversationId?: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parsePushPayload(data: unknown): PushPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const raw = data as Record<string, unknown>;
  const payload: PushPayload = {
    kind: asString(raw.kind),
    type: asString(raw.type),
    notificationId: asString(raw.notificationId),
    actorUserId: asString(raw.actorUserId),
    communityId: asString(raw.communityId),
    communityName: asString(raw.communityName),
    eventId: asString(raw.eventId),
    conversationId: asString(raw.conversationId),
  };

  if (
    !payload.kind &&
    !payload.type &&
    !payload.conversationId &&
    !payload.notificationId
  ) {
    return null;
  }

  return payload;
}

function communityStub(payload: PushPayload) {
  if (!payload.communityId) {
    return null;
  }

  return {
    id: payload.communityId,
    name: payload.communityName || "",
    members: 0,
    description: "",
    color: Colors.primary,
    memberAvatars: [] as string[],
  };
}

function navigateInbox(
  screen: "InboxHome" | "FriendRequests",
  params?: Record<string, unknown>,
) {
  navigationRef.dispatch(
    CommonActions.navigate({
      name: "MainTabs",
      params: {
        screen: "Inbox",
        params: {
          screen,
          params,
          initial: false,
        },
      },
    }),
  );
}

export function openNotificationFromPush(payload: PushPayload) {
  if (!navigationRef.isReady()) {
    return;
  }

  if (payload.kind === "chat" && payload.conversationId) {
    navigationRef.navigate("ChatThread", {
      conversationId: payload.conversationId,
    });
    return;
  }

  if (payload.type === "friend_request") {
    navigateInbox("FriendRequests");
    return;
  }

  if (payload.type === "friend_request_accepted" && payload.actorUserId) {
    navigationRef.navigate("PublicProfile", { userId: payload.actorUserId });
    return;
  }

  if (payload.type === "community_join_request") {
    const community = communityStub(payload);
    if (community) {
      navigationRef.navigate("CommunityDetail", {
        community,
        openMembers: true,
        highlightMemberUserId: payload.actorUserId || undefined,
      });
      return;
    }
  }

  if (payload.type === "accepted_to_community") {
    const community = communityStub(payload);
    if (community) {
      navigationRef.navigate("CommunityDetail", { community });
      return;
    }
  }

  if (payload.type === "event_invite" && payload.eventId && payload.communityId) {
    navigationRef.navigate("CommunityEvents", {
      communityId: payload.communityId,
      communityName: payload.communityName || "",
      isAdmin: false,
      communityIsPublic: true,
      openEventId: payload.eventId,
    });
    return;
  }

  if (
    payload.type === "liked_your_post" ||
    payload.type === "liked_your_comment" ||
    payload.type === "commented_on_your_post" ||
    payload.type === "replied_to_your_comment"
  ) {
    navigateInbox("InboxHome");
    return;
  }

  navigateInbox("InboxHome");
}
