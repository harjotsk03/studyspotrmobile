import { CommonActions, StackActions } from "@react-navigation/native";
import { Colors } from "../constants/Colors";
import { navigationRef } from "../navigation/rootNavigation";
import { fetchFeedPostById } from "./feedApi";
import { fetchChatConversations } from "./chatApi";

/** Set by `PushNotificationBridge` so a tapped push can fetch the post it
 * refers to (the payload only carries ids). */
let authToken: string | null = null;
export function setPushAuthToken(token: string | null) {
  authToken = token;
}

export type PushPayload = {
  kind?: string;
  type?: string;
  notificationId?: string;
  actorUserId?: string;
  communityId?: string;
  communityName?: string;
  eventId?: string;
  postId?: string;
  commentId?: string;
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
    postId: asString(raw.postId),
    commentId: asString(raw.commentId),
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
    const conversationId = payload.conversationId;
    const openThread = (peer?: unknown) => {
      if (!navigationRef.isReady()) return;
      // push (not navigate) so it also works when another thread is open.
      navigationRef.dispatch(
        StackActions.push("ChatThread", {
          conversationId,
          ...(peer ? { peer } : {}),
        }),
      );
    };
    if (authToken) {
      // Look up the other person so the thread header isn't blank.
      void fetchChatConversations(authToken)
        .then((list) =>
          openThread(
            list.find((c) => c.id === conversationId)?.other_user ?? undefined,
          ),
        )
        .catch(() => openThread());
    } else {
      openThread();
    }
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
    const postId = payload.postId;
    if (postId && authToken) {
      const opensComments =
        payload.type !== "liked_your_post";
      void fetchFeedPostById(authToken, postId)
        .then((post) => {
          if (!post) {
            navigateInbox("InboxHome");
            return;
          }
          navigationRef.navigate("FeedPostDetail", {
            post,
            openComments: opensComments,
            highlightCommentId: opensComments
              ? payload.commentId || null
              : null,
          });
        })
        .catch(() => navigateInbox("InboxHome"));
      return;
    }
    navigateInbox("InboxHome");
    return;
  }

  navigateInbox("InboxHome");
}
