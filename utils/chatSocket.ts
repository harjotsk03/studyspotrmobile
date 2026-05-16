import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "../constants/Api";

let socket: Socket | null = null;
let activeToken: string | null = null;

const TAG = "[chat/live]";

function logSocket(...args: unknown[]) {
  console.log(TAG, "[socket]", ...args);
}

/** HTTP origin for Socket.IO (same host as REST, without /api path). */
export function getChatSocketOrigin(): string {
  try {
    const u = new URL(API_BASE_URL);
    return `${u.protocol}//${u.host}`;
  } catch {
    return API_BASE_URL.replace(/\/$/, "");
  }
}

function attachSocketDebugListeners(s: Socket) {
  s.on("connect", () => {
    logSocket("connected", { id: s.id, transport: s.io.engine?.transport?.name });
  });
  s.on("connect_error", (err: Error & { description?: unknown }) => {
    console.warn(TAG, "[socket] connect_error", {
      message: err?.message ?? String(err),
      description: err?.description,
      data: (err as { data?: unknown }).data,
    });
  });
  s.on("disconnect", (reason: string) => {
    logSocket("disconnect", reason);
  });
  s.io.engine?.on?.("upgrade", () => {
    logSocket("transport upgraded", s.io.engine?.transport?.name);
  });
}

/**
 * Single shared socket per access token. Disconnects and reconnects when the token changes.
 */
export function getOrCreateChatSocket(accessToken: string): Socket {
  if (socket && activeToken === accessToken) {
    logSocket("reuse socket", {
      connected: socket.connected,
      id: socket.id,
    });
    return socket;
  }
  if (socket) {
    logSocket("replacing socket (token changed)");
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  activeToken = accessToken;
  const origin = getChatSocketOrigin();
  logSocket("creating io()", {
    origin,
    tokenLen: accessToken.length,
    tokenPrefix: `${accessToken.slice(0, 12)}…`,
  });
  socket = io(origin, {
    auth: { token: accessToken },
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  attachSocketDebugListeners(socket);
  return socket;
}

export function disconnectChatSocket(): void {
  logSocket("disconnectChatSocket()");
  activeToken = null;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export type JoinConversationAck =
  | { ok: true }
  | { ok: false; error?: string };

export function emitJoinConversation(
  s: Socket,
  conversationId: string,
  onAck?: (ack: JoinConversationAck) => void,
): void {
  const id = conversationId.trim();
  if (!id) {
    logSocket("join_conversation skip: empty id");
    onAck?.({ ok: false, error: "missing conversation" });
    return;
  }
  logSocket("emit join_conversation", {
    conversationId: id,
    connected: s.connected,
    socketId: s.id,
  });
  s.emit("join_conversation", id, (ack: unknown) => {
    logSocket("join_conversation ack raw", ack);
    if (ack && typeof ack === "object") {
      const o = ack as Record<string, unknown>;
      if (o.ok === true) {
        logSocket("join_conversation OK");
        onAck?.({ ok: true });
        return;
      }
      const err =
        typeof o.error === "string" && o.error.trim()
          ? o.error.trim()
          : "join failed";
      console.warn(TAG, "[socket] join_conversation failed", err);
      onAck?.({ ok: false, error: err });
      return;
    }
    console.warn(TAG, "[socket] join_conversation invalid ack shape");
    onAck?.({ ok: false, error: "invalid ack" });
  });
}

export function emitLeaveConversation(
  s: Socket,
  conversationId: string,
  onAck?: () => void,
): void {
  const id = conversationId.trim();
  if (!id) {
    logSocket("leave_conversation skip: empty id");
    onAck?.();
    return;
  }
  logSocket("emit leave_conversation", {
    conversationId: id,
    connected: s.connected,
  });
  s.emit("leave_conversation", id, () => {
    logSocket("leave_conversation ack");
    onAck?.();
  });
}
