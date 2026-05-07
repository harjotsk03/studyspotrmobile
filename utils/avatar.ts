const AVATAR_COLORS = [
  "#1A61A8",
  "#FF9900",
  "#6C5CE7",
  "#00B894",
  "#E84393",
  "#A0522D",
  "#0F766E",
  "#7C3AED",
  "#DC2626",
  "#2563EB",
];

interface AvatarUser {
  id?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  name?: string;
  email?: string;
}

export function getUserInitials(user: AvatarUser) {
  const first = user.first_name?.trim().charAt(0) ?? "";
  const last = user.last_name?.trim().charAt(0) ?? "";

  if (first || last) {
    return `${first}${last}`.toUpperCase();
  }

  const displayName = user.name?.trim();
  if (displayName) {
    const parts = displayName.split(/\s+/);
    const nameInitials = `${parts[0]?.charAt(0) ?? ""}${
      parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : ""
    }`;
    return nameInitials.toUpperCase() || "?";
  }

  return (
    user.username?.trim().charAt(0).toUpperCase() ||
    user.email?.trim().charAt(0).toUpperCase() ||
    "?"
  );
}

export function getUserAvatarColor(user: AvatarUser) {
  const seed =
    user.id?.trim() ||
    user.username?.trim().toLowerCase() ||
    user.email?.trim().toLowerCase() ||
    user.name?.trim().toLowerCase() ||
    `${user.first_name ?? ""}:${user.last_name ?? ""}`.toLowerCase();

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
