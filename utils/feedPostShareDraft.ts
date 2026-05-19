import { feedAuthorDisplayName, type FeedPost } from "./feedApi";

/**
 * Prefills the chat composer when sharing a feed post from the client.
 * Rich post cards / deep links can replace this plain-text stub when the backend is ready.
 */
export function feedPostShareDraftForMessage(post: FeedPost): string {
  const who = feedAuthorDisplayName(post.author);
  const cap = post.caption?.trim();
  const excerpt =
    cap && cap.length > 220 ? `${cap.slice(0, 217).trim()}…` : cap;
  const stub = `\n(post: ${post.id})`;

  if (excerpt) {
    return `Thought you’d like this from ${who}:\n\n“${excerpt}”${stub}`;
  }
  return `Thought you’d like this post from ${who}.${stub}`;
}
