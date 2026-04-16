import type { StudySpot } from "../context/SpotsContext";
import { toNumber } from "./toNumber";

export function getSpotScore(spot: StudySpot) {
  const candidates = [
    spot.rating,
    spot.score,
    typeof spot.average_rating === "number" || typeof spot.average_rating === "string"
      ? spot.average_rating
      : null,
    typeof spot.avg_rating === "number" || typeof spot.avg_rating === "string"
      ? spot.avg_rating
      : null,
    typeof spot.stars === "number" || typeof spot.stars === "string"
      ? spot.stars
      : null,
  ];

  const rawScore = candidates
    .map((value) => toNumber(value))
    .find((value): value is number => value !== null);

  if (rawScore === undefined) {
    return 0;
  }

  return Math.max(0, Math.min(10, rawScore * 2));
}
