import { API_BASE_URL } from "../constants/Api";

export const FEED_API_BASE = `${API_BASE_URL}/api/v1/feed`;

export type FeedVisibility = "public" | "friends_only";

export type FeedMediaItem = {
  type: "image" | "video";
  url: string;
  thumbnail_url: string | null;
};

export type FeedAuthor = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo?: string | null;
};

export type FeedPost = {
  id: string;
  author_id: string;
  caption: string | null;
  visibility: FeedVisibility;
  media: FeedMediaItem[];
  created_at: string;
  updated_at: string;
  author: FeedAuthor | null;
  like_count: number;
  comments_count: number;
  viewer_has_liked: boolean;
};

export type FeedPageResult = {
  posts: FeedPost[];
  next_cursor: string | null;
};

function authHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function apiError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const o = json as Record<string, unknown>;
  const e = o.error;
  const m = o.message;
  if (typeof e === "string" && e.trim()) return e.trim();
  if (typeof m === "string" && m.trim()) return m.trim();
  return fallback;
}

function parseVisibility(value: unknown): FeedVisibility {
  return value === "friends_only" ? "friends_only" : "public";
}

function parseMedia(raw: unknown): FeedMediaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedMediaItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) continue;
    const type = o.type === "video" ? "video" : "image";
    const thumb =
      typeof o.thumbnail_url === "string" && o.thumbnail_url.trim()
        ? o.thumbnail_url.trim()
        : null;
    out.push({ type, url, thumbnail_url: thumb });
  }
  return out;
}

function parseCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function parseBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseAuthor(raw: unknown): FeedAuthor | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  return {
    id,
    username: typeof o.username === "string" ? o.username : null,
    first_name: typeof o.first_name === "string" ? o.first_name : null,
    last_name: typeof o.last_name === "string" ? o.last_name : null,
    profile_photo:
      typeof o.profile_photo === "string" ? o.profile_photo : null,
  };
}

export function parseFeedPost(raw: unknown): FeedPost | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const author_id =
    typeof o.author_id === "string" ? o.author_id.trim() : "";
  if (!id || !author_id) return null;

  const caption =
    typeof o.caption === "string" && o.caption.trim()
      ? o.caption.trim()
      : null;

  return {
    id,
    author_id,
    caption,
    visibility: parseVisibility(o.visibility),
    media: parseMedia(o.media),
    created_at:
      typeof o.created_at === "string" ? o.created_at : new Date().toISOString(),
    updated_at:
      typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
    author: parseAuthor(o.author),
    like_count: parseCount(o.like_count),
    comments_count: parseCount(o.comments_count),
    viewer_has_liked: parseBool(o.viewer_has_liked),
  };
}

function parseFeedPage(data: unknown): FeedPageResult {
  if (!data || typeof data !== "object") {
    return { posts: [], next_cursor: null };
  }
  const o = data as Record<string, unknown>;
  const rawPosts = o.posts;
  const posts: FeedPost[] = [];
  if (Array.isArray(rawPosts)) {
    for (const p of rawPosts) {
      const parsed = parseFeedPost(p);
      if (parsed) posts.push(parsed);
    }
  }
  const cursor =
    typeof o.next_cursor === "string" && o.next_cursor.trim()
      ? o.next_cursor.trim()
      : null;
  return { posts, next_cursor: cursor };
}

export async function fetchFeedPublic(
  token: string,
  opts?: { limit?: number; cursor?: string | null },
): Promise<FeedPageResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) params.set("cursor", opts.cursor);

  const res = await fetch(`${FEED_API_BASE}/public?${params}`, {
    headers: authHeaders(token),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not load feed (${res.status})`));
  }
  return parseFeedPage(json);
}

export async function fetchFeedFriends(
  token: string,
  opts?: { limit?: number; cursor?: string | null },
): Promise<FeedPageResult> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) params.set("cursor", opts.cursor);

  const res = await fetch(`${FEED_API_BASE}/friends?${params}`, {
    headers: authHeaders(token),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not load friends feed (${res.status})`));
  }
  return parseFeedPage(json);
}

export async function fetchFeedPostById(
  token: string,
  postId: string,
): Promise<FeedPost | null> {
  const res = await fetch(
    `${FEED_API_BASE}/posts/${encodeURIComponent(postId)}`,
    { headers: authHeaders(token) },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not load post (${res.status})`));
  }
  if (!json || typeof json !== "object") return null;
  const post = (json as Record<string, unknown>).post;
  return parseFeedPost(post);
}

export type LocalFeedMediaFile = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  mediaType: "image" | "video";
};

const MAX_POST_MEDIA = 10;
export const MAX_FEED_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_FEED_CAPTION_LENGTH = 2000;

export async function createFeedPostMultipart(
  token: string,
  args: {
    visibility: FeedVisibility;
    caption?: string | null;
    files: LocalFeedMediaFile[];
  },
): Promise<FeedPost | null> {
  const { visibility, files } = args;
  if (!files.length || files.length > MAX_POST_MEDIA) {
    throw new Error(`Add between 1 and ${MAX_POST_MEDIA} photos or videos.`);
  }

  let caption: string | null =
    typeof args.caption === "string" ? args.caption.trim() : null;
  if (caption === "") caption = null;
  if (caption && caption.length > MAX_FEED_CAPTION_LENGTH) {
    throw new Error(`Caption must be at most ${MAX_FEED_CAPTION_LENGTH} characters.`);
  }

  const media_types = files.map((f) => f.mediaType);

  const postPayload: Record<string, unknown> = {
    visibility,
    media_types,
  };
  if (caption) postPayload.caption = caption;

  const form = new FormData();
  form.append("postData", JSON.stringify(postPayload));

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const rawName =
      f.fileName?.trim() ||
      f.uri.split("/").pop()?.split("?")[0] ||
      `upload_${i}.${f.mediaType === "video" ? "mp4" : "jpg"}`;
    const ext = rawName.includes(".")
      ? rawName.split(".").pop()?.toLowerCase()
      : "";
    let type =
      f.mimeType?.trim() ||
      (f.mediaType === "video"
        ? "video/mp4"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg");
    if (f.mediaType === "video" && !type.startsWith("video/")) {
      type = "video/mp4";
    }
    if (f.mediaType === "image" && !type.startsWith("image/")) {
      type = "image/jpeg";
    }

    form.append(
      "media",
      {
        uri: f.uri,
        type,
        name: rawName.includes(".") ? rawName : `${rawName}.jpg`,
      } as unknown as Blob,
    );
  }

  const res = await fetch(`${FEED_API_BASE}/posts`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const json = await res.json().catch(() => null);

  if (res.status === 413) {
    throw new Error(
      apiError(json, "That file is too large (max 50 MB per item)."),
    );
  }
  if (res.status === 429) {
    throw new Error(
      apiError(json, "You're posting a bit too fast. Try again shortly."),
    );
  }
  if (!res.ok) {
    throw new Error(apiError(json, `Could not publish (${res.status})`));
  }

  if (!json || typeof json !== "object") return null;
  const post = (json as Record<string, unknown>).post;
  return parseFeedPost(post);
}

/** Merge engagement fields from API partial `post` blob onto an existing post. */
export function mergeFeedPostEngagement(
  post: FeedPost,
  raw: unknown,
): FeedPost {
  if (!raw || typeof raw !== "object") return post;
  const o = raw as Record<string, unknown>;
  return {
    ...post,
    like_count:
      o.like_count !== undefined ? parseCount(o.like_count) : post.like_count,
    comments_count:
      o.comments_count !== undefined
        ? parseCount(o.comments_count)
        : post.comments_count,
    viewer_has_liked:
      o.viewer_has_liked !== undefined
        ? parseBool(o.viewer_has_liked)
        : post.viewer_has_liked,
  };
}

export async function likeFeedPost(
  token: string,
  postId: string,
): Promise<FeedPost | null> {
  const res = await fetch(
    `${FEED_API_BASE}/posts/${encodeURIComponent(postId)}/like`,
    { method: "POST", headers: authHeaders(token) },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not like post (${res.status})`));
  }
  if (!json || typeof json !== "object") return null;
  const post = (json as Record<string, unknown>).post;
  return parseFeedPost(post);
}

export async function unlikeFeedPost(
  token: string,
  postId: string,
): Promise<FeedPost | null> {
  const res = await fetch(
    `${FEED_API_BASE}/posts/${encodeURIComponent(postId)}/like`,
    { method: "DELETE", headers: authHeaders(token) },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not unlike post (${res.status})`));
  }
  if (!json || typeof json !== "object") return null;
  const post = (json as Record<string, unknown>).post;
  return parseFeedPost(post);
}

export type FeedComment = {
  id: string;
  content: string;
  created_at: string;
  author_id?: string;
  user_id?: string;
  user: FeedAuthor | null;
};

export type FeedCommentsPage = {
  comments: FeedComment[];
  next_cursor: string | null;
};

function parseFeedComment(raw: unknown): FeedComment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const content =
    typeof o.content === "string" ? o.content.trim() : "";
  if (!id || !content) return null;
  const aid =
    typeof o.author_id === "string"
      ? o.author_id.trim()
      : typeof o.user_id === "string"
        ? o.user_id.trim()
        : "";
  return {
    id,
    content,
    created_at:
      typeof o.created_at === "string" ? o.created_at : new Date().toISOString(),
    author_id: aid || undefined,
    user_id: typeof o.user_id === "string" ? o.user_id.trim() : undefined,
    user: parseAuthor(o.user),
  };
}

function parseCommentsPage(data: unknown): FeedCommentsPage {
  if (!data || typeof data !== "object") {
    return { comments: [], next_cursor: null };
  }
  const o = data as Record<string, unknown>;
  const rawList = o.comments;
  const comments: FeedComment[] = [];
  if (Array.isArray(rawList)) {
    for (const c of rawList) {
      const p = parseFeedComment(c);
      if (p) comments.push(p);
    }
  }
  const cursor =
    typeof o.next_cursor === "string" && o.next_cursor.trim()
      ? o.next_cursor.trim()
      : null;
  return { comments, next_cursor: cursor };
}

export async function fetchFeedPostComments(
  token: string,
  postId: string,
  opts?: { limit?: number; cursor?: string | null },
): Promise<FeedCommentsPage> {
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 50);
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts?.cursor) params.set("cursor", opts.cursor);

  const res = await fetch(
    `${FEED_API_BASE}/posts/${encodeURIComponent(postId)}/comments?${params}`,
    { headers: authHeaders(token) },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not load comments (${res.status})`));
  }
  return parseCommentsPage(json);
}

export const MAX_FEED_COMMENT_LENGTH = 2000;

export async function createFeedComment(
  token: string,
  postId: string,
  content: string,
): Promise<FeedComment | null> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Write something first.");
  if (trimmed.length > MAX_FEED_COMMENT_LENGTH) {
    throw new Error(`Comment must be at most ${MAX_FEED_COMMENT_LENGTH} characters.`);
  }

  const res = await fetch(
    `${FEED_API_BASE}/posts/${encodeURIComponent(postId)}/comments`,
    {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: trimmed }),
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not comment (${res.status})`));
  }
  if (!json || typeof json !== "object") return null;
  const comment = (json as Record<string, unknown>).comment;
  return parseFeedComment(comment);
}

export async function deleteFeedComment(
  token: string,
  commentId: string,
): Promise<void> {
  const res = await fetch(
    `${FEED_API_BASE}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE", headers: authHeaders(token) },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not delete comment (${res.status})`));
  }
}

export async function deleteFeedPost(
  token: string,
  postId: string,
): Promise<void> {
  const res = await fetch(
    `${FEED_API_BASE}/posts/${encodeURIComponent(postId)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not delete post (${res.status})`));
  }
}

export function feedAuthorDisplayName(author: FeedAuthor | null): string {
  if (!author) return "Member";
  const full = [author.first_name, author.last_name]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .trim();
  if (full) return full;
  if (typeof author.username === "string" && author.username.trim()) {
    return `@${author.username.trim()}`;
  }
  return "Member";
}
