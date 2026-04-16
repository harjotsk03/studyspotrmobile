import type { StudySpot } from "../context/SpotsContext";
import { toNumber } from "./toNumber";

export function getSpotCoordinates(spot: StudySpot) {
  const latitude = toNumber(
    spot.latitude ??
      (typeof spot.lat === "number" || typeof spot.lat === "string"
        ? spot.lat
        : null) ??
      (typeof spot.latitude === "number" || typeof spot.latitude === "string"
        ? spot.latitude
        : null),
  );
  const longitude = toNumber(
    spot.longitude ??
      (typeof spot.lng === "number" || typeof spot.lng === "string"
        ? spot.lng
        : null) ??
      (typeof spot.lon === "number" || typeof spot.lon === "string"
        ? spot.lon
        : null),
  );

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}
