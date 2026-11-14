import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { fetchChatConversations, isConversationUnread } from "../utils/chatApi";

const POLL_MS = 4000;

type ChatUnreadState = {
  /** Number of chats with something unread (a chat with 10 unread = 1). */
  unreadChats: number;
  refreshChatUnread: () => Promise<void>;
};

const ChatUnreadContext = createContext<ChatUnreadState | null>(null);

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [unreadChats, setUnreadChats] = useState(0);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refreshChatUnread = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) {
      setUnreadChats(0);
      return;
    }
    try {
      const list = await fetchChatConversations(t);
      setUnreadChats(list.filter(isConversationUnread).length);
    } catch {
      // Keep the last known count; the next poll will retry.
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setUnreadChats(0);
      return;
    }
    void refreshChatUnread();
    const id = setInterval(() => void refreshChatUnread(), POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refreshChatUnread();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [token, refreshChatUnread]);

  const value = useMemo(
    () => ({ unreadChats, refreshChatUnread }),
    [unreadChats, refreshChatUnread],
  );

  return (
    <ChatUnreadContext.Provider value={value}>
      {children}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread(): ChatUnreadState {
  const ctx = useContext(ChatUnreadContext);
  return ctx ?? { unreadChats: 0, refreshChatUnread: async () => {} };
}
