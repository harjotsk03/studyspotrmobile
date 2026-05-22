import type { StudySpot } from "../context/SpotsContext";
import { getSpotTitle } from "./getSpotTitle";
import { encodeShareToken } from "./messageShare";

/**
 * Builds the initial chat composer text when a user shares a study spot.
 * The trailing token (`[[share:spot:<id>]]`) is what the receiver's chat
 * thread parses out and replaces with a `SharedAttachmentPreview` card.
 */
export function spotShareDraftForMessage(spot: StudySpot): string {
  const title = getSpotTitle(spot);
  const token = encodeShareToken({ kind: "spot", id: spot.id });
  const desc =
    typeof spot.description === "string" ? spot.description.trim() : "";

  if (desc) {
    const excerpt = desc.length > 180 ? `${desc.slice(0, 177).trim()}…` : desc;
    return `Check out this study spot — ${title}.\n\n“${excerpt}”\n${token}`;
  }
  return `Check out this study spot — ${title}.\n${token}`;
}
