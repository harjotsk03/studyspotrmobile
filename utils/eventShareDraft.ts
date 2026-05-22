import type { CommunityEvent } from "../screens/EventDetailDrawer";
import { encodeShareToken } from "./messageShare";

function formatEventDateLine(iso?: string | null): string {
  if (typeof iso !== "string" || !iso.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Builds the initial chat composer text when a user shares an event.
 * The trailing token (`[[share:event:<communityId>:<eventId>]]`) is what
 * the receiver's chat thread parses out and replaces with a
 * `SharedAttachmentPreview` card.
 */
export function eventShareDraftForMessage(
  event: CommunityEvent,
  communityId: string,
): string {
  const title = event.title?.trim() || "this event";
  const token = encodeShareToken({
    kind: "event",
    id: event.id,
    communityId,
  });
  const when = formatEventDateLine(event.start_time);
  if (when) {
    return `Heads up — ${title} is happening ${when}.\n${token}`;
  }
  return `Want to come to ${title}?\n${token}`;
}
