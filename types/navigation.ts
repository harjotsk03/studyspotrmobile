import type { CommunityData } from "../screens/CommunityDetailScreen";

export type RootStackParamList = {
  MainTabs: undefined;
  PublicProfile: { userId: string };
  CommunityDetail: {
    community: CommunityData;
    openMembers?: boolean;
    highlightMemberUserId?: string;
  };
  CommunityMembers: {
    communityId: string;
    communityName: string;
    isAdmin: boolean;
    highlightUserId?: string;
  };
};
