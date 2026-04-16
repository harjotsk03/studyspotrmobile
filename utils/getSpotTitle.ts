import type { StudySpot } from "../context/SpotsContext";

export function getSpotTitle(spot: StudySpot) {
  const candidates = [
    spot.title,
    spot.name,
    typeof spot.spot_name === "string" ? spot.spot_name : null,
    typeof spot.spot_title === "string" ? spot.spot_title : null,
  ];

  return (
    candidates.find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    ) ?? "Untitled Spot"
  );
}
