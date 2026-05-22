import type { CommunityData } from "../screens/CommunityDetailScreen";
import { encodeShareToken } from "./messageShare";

/**
 * Builds the initial chat composer text when a user shares a community.
 * The trailing token (`[[share:community:<id>]]`) is what the receiver's
 * chat thread parses out and replaces with a `SharedAttachmentPreview`
 * card.
 */
export function communityShareDraftForMessage(community: CommunityData): string {
  const name = community.name?.trim() || "this community";
  const token = encodeShareToken({ kind: "community", id: community.id });
  const desc =
    typeof community.description === "string"
      ? community.description.trim()
      : "";

  if (desc) {
    const excerpt = desc.length > 180 ? `${desc.slice(0, 177).trim()}…` : desc;
    return `Check out the ${name} community.\n\n“${excerpt}”\n${token}`;
  }
  return `Check out the ${name} community.\n${token}`;
}
