import type { StudySpot } from "../context/SpotsContext";
import { getSpotDescription } from "./getSpotDescription";
import { getSpotTitle } from "./getSpotTitle";

export function getSpotSearchText(spot: StudySpot) {
  return [
    getSpotTitle(spot),
    getSpotDescription(spot),
    typeof spot.address === "string" ? spot.address : "",
    typeof spot.location === "string" ? spot.location : "",
    typeof spot.category === "string" ? spot.category : "",
  ]
    .join(" ")
    .toLowerCase();
}
