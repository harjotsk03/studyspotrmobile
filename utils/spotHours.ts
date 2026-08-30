export function isSpotAlwaysOpen(spot: { is_24_hours?: unknown } | null | undefined) {
  if (!spot) return false;
  const value = spot.is_24_hours;
  return value === true || value === 1 || value === "1" || value === "true";
}
