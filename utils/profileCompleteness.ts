type NameUsernameFields = {
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
  onboarding_completed?: unknown;
};

function isBlank(value: unknown) {
  return typeof value !== "string" || value.trim().length === 0;
}

export function isPlaceholderUsername(username: unknown) {
  return typeof username === "string" && username.trim().startsWith("_tmp_");
}

export function visibleUsername(username: unknown) {
  if (typeof username !== "string") return "";
  const trimmed = username.trim();
  if (!trimmed || isPlaceholderUsername(trimmed)) return "";
  return trimmed;
}

export function profileNeedsOnboarding(profile?: NameUsernameFields | null) {
  if (!profile) return true;
  if (isBlank(profile.first_name) || isBlank(profile.last_name)) return true;
  const username =
    typeof profile.username === "string" ? profile.username.trim() : "";
  if (!username || isPlaceholderUsername(username)) return true;
  if (profile.onboarding_completed === false) return true;
  return false;
}
