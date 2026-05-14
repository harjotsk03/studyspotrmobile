import { API_BASE_URL } from "../constants/Api";

export interface CommunityMembershipSnapshot {
  is_member: boolean;
  is_pending: boolean;
  my_role?: string;
  membership_status?: string;
  user_role?: string;
  user_membership_status?: "pending" | "accepted";
}

type RawMembership = {
  is_member?: boolean;
  is_pending?: boolean;
  my_role?: string | null;
  user_role?: string | null;
  role?: string | null;
  membership_status?: string | null;
  user_membership_status?: string | null;
  status?: string | null;
};

type MembershipResponse =
  | RawMembership
  | {
      membership?: RawMembership | null;
      community_membership?: RawMembership | null;
      communityMembership?: RawMembership | null;
      community?: RawMembership | null;
      error?: string;
      message?: string;
    };

function unwrapMembershipPayload(json: MembershipResponse | null): RawMembership {
  if (!json) return {};
  if ("membership" in json && json.membership) return json.membership;
  if ("community_membership" in json && json.community_membership) {
    return json.community_membership;
  }
  if ("communityMembership" in json && json.communityMembership) {
    return json.communityMembership;
  }
  if ("community" in json && json.community) return json.community;
  return json as RawMembership;
}

export function normalizeCommunityMembership(
  raw: RawMembership,
): CommunityMembershipSnapshot {
  const status =
    raw.membership_status ?? raw.user_membership_status ?? raw.status ?? undefined;
  const rawRole = raw.my_role ?? raw.user_role ?? raw.role ?? undefined;
  const isMember = raw.is_member ?? (status === "accepted" || !!rawRole);
  const isPending = raw.is_pending ?? status === "pending";
  const role = isMember ? rawRole ?? "member" : undefined;
  const userMembershipStatus =
    status === "pending" || status === "accepted" ? status : undefined;

  return {
    is_member: isMember,
    is_pending: isPending,
    my_role: role,
    user_role: role,
    membership_status: status,
    user_membership_status: userMembershipStatus,
  };
}

export async function fetchCommunityMembership(
  token: string,
  communityId: string,
): Promise<CommunityMembershipSnapshot> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/communities/${communityId}/membership/me`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );
  const json = (await res.json().catch(() => null)) as MembershipResponse | null;
  if (!res.ok) {
    const message =
      json &&
      (("error" in json && typeof json.error === "string") ||
        ("message" in json && typeof json.message === "string"))
        ? "error" in json && typeof json.error === "string"
          ? json.error
          : json.message
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return normalizeCommunityMembership(unwrapMembershipPayload(json));
}

export function isCommunityAdminOrOwner(
  membership: Pick<CommunityMembershipSnapshot, "my_role" | "user_role">,
): boolean {
  const role = membership.my_role ?? membership.user_role;
  return role === "owner" || role === "admin";
}

export function isCommunityOwner(
  membership: Pick<CommunityMembershipSnapshot, "my_role" | "user_role">,
): boolean {
  return (membership.my_role ?? membership.user_role) === "owner";
}
