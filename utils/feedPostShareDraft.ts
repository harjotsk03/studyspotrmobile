import { feedAuthorDisplayName, type FeedPost } from "./feedApi";
import { encodeShareToken } from "./messageShare";

/**
 * Builds the initial chat composer text when a user shares a feed post.
 * The trailing token (`[[share:post:<id>]]`) is what the receiver's chat
 * thread parses out and replaces with a `SharedAttachmentPreview` card.
 */
export function feedPostShareDraftForMessage(post: FeedPost): string {
  const who = feedAuthorDisplayName(post.author);
  const cap = post.caption?.trim();
  const excerpt =
    cap && cap.length > 220 ? `${cap.slice(0, 217).trim()}…` : cap;
  const token = encodeShareToken({ kind: "post", id: post.id });

  if (excerpt) {
    return `Thought you’d like this from ${who}:\n\n“${excerpt}”\n${token}`;
  }
  return `Thought you’d like this post from ${who}.\n${token}`;
}
