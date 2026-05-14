import type { CommunityStackParamList } from "../screens/CommunityDetailScreen";

/** Community screens mounted on RootStack must match `CommunityStackParamList`. */
export type RootStackParamList = {
  MainTabs: undefined;
  PublicProfile: { userId: string };
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
