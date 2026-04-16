import type { StudySpot } from "../context/SpotsContext";

export function getSpotDescription(spot: StudySpot) {
  const candidates = [
    spot.description,
    typeof spot.address === "string" ? spot.address : null,
    typeof spot.location === "string" ? spot.location : null,
    typeof spot.notes === "string" ? spot.notes : null,
  ];

  return (
    candidates.find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    ) ?? "No description available yet."
  );
}
