import { API_BASE_URL } from "../constants/Api";

export const CHAT_API_BASE = `${API_BASE_URL}/api/v1/chat`;

export type ChatOtherUser = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo?: string | null;
};

export type ChatConversation = {
  id: string;
  kind?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  my_last_read_at?: string | null;
  other_user?: ChatOtherUser | null;
  [key: string]: unknown;
};

export type ChatMessageSender = ChatOtherUser;

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: ChatMessageSender | null;
  [key: string]: unknown;
};

function authHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
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

function parseOtherUser(raw: unknown): ChatOtherUser | null {
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

function parseConversation(raw: unknown): ChatConversation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  return {
    ...o,
    id,
    kind: typeof o.kind === "string" ? o.kind : null,
    last_message_at:
      typeof o.last_message_at === "string" ? o.last_message_at : null,
    last_message_preview:
      typeof o.last_message_preview === "string"
        ? o.last_message_preview
        : null,
    my_last_read_at:
      typeof o.my_last_read_at === "string" ? o.my_last_read_at : null,
    other_user: parseOtherUser(o.other_user),
  };
}

export function parseChatMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const conversation_id =
    typeof o.conversation_id === "string" ? o.conversation_id.trim() : "";
  const sender_id =
    typeof o.sender_id === "string" ? o.sender_id.trim() : "";
  const body = typeof o.body === "string" ? o.body : "";
  const created_at =
    typeof o.created_at === "string" ? o.created_at.trim() : "";
  if (!id || !conversation_id || !sender_id || !created_at) return null;
  const senderRaw = o.sender;
  return {
    ...o,
    id,
    conversation_id,
    sender_id,
    body,
    created_at,
    sender:
      senderRaw && typeof senderRaw === "object"
        ? parseOtherUser(senderRaw)
        : null,
  };
}

/** Merge message lists without duplicate ids (later arguments overwrite earlier). Newest-first sort. */
export function mergeMessagesDedupeNewestFirst(
  ...batches: ChatMessage[][]
): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const batch of batches) {
    for (const m of batch) {
      map.set(m.id, m);
    }
  }
  const merged = [...map.values()];
  merged.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return merged;
}

export function chatPeerDisplayName(peer: ChatOtherUser | null | undefined) {
  if (!peer) return "Chat";
  const full = [peer.first_name, peer.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  const u = typeof peer.username === "string" ? peer.username.trim() : "";
  if (u) return u.startsWith("@") ? u : `@${u}`;
  return "Chat";
}

export async function fetchChatConversations(
  token: string,
): Promise<ChatConversation[]> {
  const res = await fetch(`${CHAT_API_BASE}/conversations`, {
    headers: authHeaders(token),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not load conversations (${res.status})`));
  }
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const raw = o.conversations;
  if (!Array.isArray(raw)) return [];
  const out: ChatConversation[] = [];
  for (const item of raw) {
    const c = parseConversation(item);
    if (c) out.push(c);
  }
  return out;
}

export type CreateDirectConversationResult = {
  conversation: ChatConversation;
  other_user: ChatOtherUser | null;
  created?: boolean;
};

export async function createDirectConversation(
  token: string,
  otherUserId: string,
): Promise<CreateDirectConversationResult> {
  const res = await fetch(`${CHAT_API_BASE}/conversations/direct`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ other_user_id: otherUserId.trim() }),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not start chat (${res.status})`));
  }
  if (!json || typeof json !== "object") {
    throw new Error("Invalid response from server.");
  }
  const o = json as Record<string, unknown>;
  const conversation = parseConversation(o.conversation);
  if (!conversation) {
    throw new Error("Missing conversation in response.");
  }
  return {
    conversation,
    other_user: parseOtherUser(o.other_user),
    created:
      typeof o.created === "boolean"
        ? o.created
        : res.status === 201
          ? true
          : undefined,
  };
}

export type ChatMessagesPage = {
  messages: ChatMessage[];
  next_cursor: string | null;
};

export async function fetchChatMessages(
  token: string,
  conversationId: string,
  opts?: { limit?: number; cursor?: string | null },
): Promise<ChatMessagesPage> {
  const limit = opts?.limit ?? 40;
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(100, Math.max(1, limit))));
  if (opts?.cursor && opts.cursor.trim()) {
    params.set("cursor", opts.cursor.trim());
  }
  const url = `${CHAT_API_BASE}/conversations/${encodeURIComponent(
    conversationId,
  )}/messages?${params.toString()}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not load messages (${res.status})`));
  }
  if (!json || typeof json !== "object") {
    return { messages: [], next_cursor: null };
  }
  const o = json as Record<string, unknown>;
  const raw = o.messages;
  const messages: ChatMessage[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const m = parseChatMessage(item);
      if (m) messages.push(m);
    }
  }
  const cursor =
    typeof o.next_cursor === "string" && o.next_cursor.trim()
      ? o.next_cursor.trim()
      : null;
  return { messages, next_cursor: cursor };
}

export async function sendChatMessage(
  token: string,
  conversationId: string,
  body: string,
): Promise<ChatMessage> {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 8000) {
    throw new Error("Message must be between 1 and 8000 characters.");
  }
  const res = await fetch(
    `${CHAT_API_BASE}/conversations/${encodeURIComponent(
      conversationId,
    )}/messages`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ body: trimmed }),
    },
  );
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not send message (${res.status})`));
  }
  if (!json || typeof json !== "object") {
    throw new Error("Invalid send response.");
  }
  const o = json as Record<string, unknown>;
  const msg = parseChatMessage(o.message ?? json);
  if (!msg) {
    throw new Error("Invalid message in response.");
  }
  return msg;
}

export async function markChatConversationRead(
  token: string,
  conversationId: string,
): Promise<void> {
  const res = await fetch(
    `${CHAT_API_BASE}/conversations/${encodeURIComponent(
      conversationId,
    )}/read`,
    {
      method: "PATCH",
      headers: authHeaders(token),
    },
  );
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not update read state (${res.status})`));
  }
}

export function isConversationUnread(c: ChatConversation): boolean {
  const lastAt = c.last_message_at;
  if (!lastAt || !lastAt.trim()) return false;
  const readAt = c.my_last_read_at;
  if (!readAt || !readAt.trim()) return true;
  const tMsg = new Date(lastAt).getTime();
  const tRead = new Date(readAt).getTime();
  if (!Number.isFinite(tMsg) || !Number.isFinite(tRead)) return true;
  return tMsg > tRead;
}
