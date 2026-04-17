// hooks/useSuggestedUsers.ts
import { useCallback, useState } from "react";
import { API_BASE_URL } from "../constants/Api";
import { useAuth } from "../context/AuthContext";

export type SuggestedUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  username?: string;
  profile_photo?: string;
  avatar?: string;
  bio?: string;
  school?: string;
  city?: string;
  country?: string;
  friend_status?: string;
  [key: string]: unknown;
};

type FetchSuggestedUsersParams = {
  limit?: number;
  offset?: number;
};

export function useSuggestedUsers() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestedUsers = useCallback(
    async ({ limit = 10, offset = 0 }: FetchSuggestedUsersParams = {}): Promise<
      SuggestedUser[]
    > => {
      if (!token) {
        setError("You must be logged in to load suggested users.");
        return [];
      }

      const safeLimit = Math.min(Math.max(limit, 1), 100);
      const safeOffset = Math.max(offset, 0);

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: String(safeLimit),
          offset: String(safeOffset),
        });

        const res = await fetch(
          `${API_BASE_URL}/api/v1/users/fetch-suggested-users?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const message =
            typeof data?.error === "string"
              ? data.error
              : typeof data?.message === "string"
                ? data.message
                : "Failed to load suggested users.";

          setError(message);
          return [];
        }

        if (!Array.isArray(data?.users)) {
          return [];
        }

        return data.users as SuggestedUser[];
      } catch {
        const message = "Could not reach the server.";
        setError(message);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const sendFriendRequest = useCallback(
    async (friendId: string) => {
      if (!token) {
        setError("You must be logged in to add friends.");
        return false;
      }

      if (!friendId.trim()) {
        setError("Missing friend ID.");
        return false;
      }

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/users/send-friend-request`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ friend_id: friendId }),
          },
        );

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const message =
            typeof data?.error === "string"
              ? data.error
              : typeof data?.message === "string"
                ? data.message
                : "Failed to send friend request.";
          setError(message);
          return false;
        }

        setError(null);
        return true;
      } catch {
        setError("Could not reach the server.");
        return false;
      }
    },
    [token],
  );

  return {
    fetchSuggestedUsers,
    sendFriendRequest,
    loadingSuggestedUsers: loading,
    suggestedUsersError: error,
  };
}
