import type { NavigatorScreenParams } from "@react-navigation/native";
import type { CommunityStackParamList } from "../screens/CommunityDetailScreen";
import type { StudySpot } from "../context/SpotsContext";
import type { FeedPost } from "../utils/feedApi";
import type { ChatOtherUser } from "../utils/chatApi";
import type { UserPostsFeedParams } from "../screens/UserPostsFeedScreen";

export type AuthStackParamList = {
  WelcomeScreen: undefined;
  LoginScreen: undefined;
  SignupMethodScreen: undefined;
  RegisterScreen: undefined;
  ForgotPasswordScreen: undefined;
};

export type SpotsStackParamList = {
  SpotsHome: undefined;
  SpotDetail: { spot: StudySpot };
  CreateSpot: undefined;
  EditSpot: { spot: StudySpot };
};

export type ChatThreadParams = {
  conversationId: string;
  peer?: ChatOtherUser;
  /** One-shot composer prefilled when sharing a post (cleared after apply). */
  draftMessage?: string;
};

export type InboxStackParamList = {
  InboxHome: undefined;
  FriendRequests: undefined;
};

export type MainTabsParamList = {
  Spots: NavigatorScreenParams<SpotsStackParamList>;
  Community: undefined;
  Feed: undefined;
  Inbox: NavigatorScreenParams<InboxStackParamList>;
  Profile: undefined;
};

/** Community screens mounted on RootStack must match `CommunityStackParamList`. */
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined;
  FeedComposer: undefined;
  PublicProfile: { userId: string };
  FeedPostDetail: {
    post: FeedPost;
    openComments?: boolean;
    highlightCommentId?: string | null;
  };
  FeedInteractions: undefined;
  Messages: undefined;
  ChatThread: ChatThreadParams;
  BlockedUsers: undefined;
  SpotViewer: { spot: StudySpot };
  UserPostsFeed: UserPostsFeedParams;
} & Pick<
  CommunityStackParamList,
  | "CommunityDetail"
  | "CommunityMembers"
  | "CommunityInfo"
  | "CommunityEvents"
  | "EditCommunity"
  | "CreateEvent"
  | "InviteEvent"
>;
