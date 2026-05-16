import { API_BASE_URL } from "../constants/Api";
import type { StudySpot } from "../context/SpotsContext";

export const SPOTS_API_BASE = `${API_BASE_URL}/api/v1/spots`;

/** Nested user object returned with reviews from some API endpoints. */
export type SpotReviewUserSnippet = {
  id?: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_photo?: string | null;
};

export type SpotReview = {
  id?: string;
  review_id?: string;
  spot_id?: string;
  user_id?: string;
  content?: string;
  rating?: number;
  created_at?: string;
  user_name?: string;
  user_profile_photo?: string;
  user?: SpotReviewUserSnippet | null;
  image_urls?: string[];
  images?: string[];
  [key: string]: unknown;
};

/** Avatar URL for list/detail UI (flat field or nested `user.profile_photo`). */
export function spotReviewUserProfilePhoto(review: SpotReview): string | undefined {
  const flat =
    typeof review.user_profile_photo === "string"
      ? review.user_profile_photo.trim()
      : "";
  if (flat) return flat;
  const u = review.user;
  if (!u || typeof u !== "object") return undefined;
  const photo =
    typeof u.profile_photo === "string" ? u.profile_photo.trim() : "";
  return photo || undefined;
}

/** Stable reviewer id for navigation (top-level or nested `user.id`). */
export function spotReviewViewerUserId(review: SpotReview): string {
  if (typeof review.user_id === "string" && review.user_id.trim()) {
    return review.user_id.trim();
  }
  const nested = review.user?.id;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return "";
}

export function spotReviewPhotoUrls(review: SpotReview): string[] {
  const fromUrls = Array.isArray(review.image_urls)
    ? review.image_urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];
  if (fromUrls.length > 0) return fromUrls;
  const legacy = Array.isArray(review.images)
    ? review.images.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : [];
  return legacy;
}

export function spotReviewPrimaryId(review: SpotReview): string | undefined {
  if (typeof review.id === "string" && review.id.trim()) return review.id.trim();
  if (typeof review.review_id === "string" && review.review_id.trim()) {
    return review.review_id.trim();
  }
  return undefined;
}

/** Title for a review row; prefers API spot_title / spot_name over generic placeholders. */
export function spotReviewSpotLabel(review: SpotReview): string {
  const t =
    typeof review.spot_title === "string" ? review.spot_title.trim() : "";
  if (t) return t;
  const n =
    typeof review.spot_name === "string" ? review.spot_name.trim() : "";
  if (n) return n;
  return "Untitled Spot";
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

export function unwrapSpotsPayload(data: unknown): StudySpot[] {
  if (Array.isArray(data)) return data as StudySpot[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.spots)) return o.spots as StudySpot[];
    if (Array.isArray(o.data)) return o.data as StudySpot[];
  }
  return [];
}

export async function fetchAllSpots(): Promise<StudySpot[]> {
  const res = await fetch(SPOTS_API_BASE, {
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(data, `Failed to load spots (${res.status})`));
  }
  return unwrapSpotsPayload(data);
}

export async function fetchSpotById(id: string): Promise<StudySpot | null> {
  const res = await fetch(`${SPOTS_API_BASE}/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(data, `Failed to load spot (${res.status})`));
  }
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  return (o.spot ?? o.data ?? data) as StudySpot;
}

export async function fetchReviewsBySpot(spotId: string): Promise<SpotReview[]> {
  const url = `${SPOTS_API_BASE}/getReviewsBySpot?spot_id=${encodeURIComponent(spotId)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(data, `Failed to load reviews (${res.status})`));
  }
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const reviews = o.reviews;
  return Array.isArray(reviews) ? (reviews as SpotReview[]) : [];
}

/**
 * Reviews left by a user (all spots). Expected API:
 * `GET /api/v1/spots/getReviewsByUser?user_id=...` with optional `Authorization` for private fields.
 * Confirm with backend; adjust path or response shape if your server differs.
 */
export async function fetchReviewsByUserId(
  userId: string,
  opts?: { token?: string | null },
): Promise<SpotReview[]> {
  const url = `${SPOTS_API_BASE}/getReviewsByUser?user_id=${encodeURIComponent(userId)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const t = opts?.token?.trim();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(data, `Failed to load user reviews (${res.status})`));
  }
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const reviews = o.reviews;
  return Array.isArray(reviews) ? (reviews as SpotReview[]) : [];
}

/** Multipart POST createSpot: `spotData` JSON string + 1–5 `images`. */
export async function createSpotMultipart(
  spotData: Record<string, unknown>,
  imageAssets: { uri: string; mimeType?: string | null; fileName?: string | null }[],
): Promise<{ spot?: StudySpot } & Record<string, unknown>> {
  if (imageAssets.length < 1 || imageAssets.length > 5) {
    throw new Error("Choose between 1 and 5 photos for your spot.");
  }

  const form = new FormData();
  form.append("spotData", JSON.stringify(spotData));

  for (let i = 0; i < imageAssets.length; i++) {
    const asset = imageAssets[i];
    const rawName =
      asset.fileName?.trim() ||
      asset.uri.split("/").pop()?.split("?")[0] ||
      `image_${i}.jpg`;
    const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase() : "";
    const type =
      asset.mimeType?.trim() ||
      (ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg");
    const name = rawName.includes(".") ? rawName : `${rawName}.jpg`;

    form.append(
      "images",
      {
        uri: asset.uri,
        type,
        name,
      } as unknown as Blob,
    );
  }

  const res = await fetch(`${SPOTS_API_BASE}/createSpot`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });

  const json = await res.json().catch(() => null);

  if (res.status === 429) {
    throw new Error(
      apiError(json, "Too many spots created recently. Wait a bit and try again."),
    );
  }

  if (!res.ok) {
    throw new Error(apiError(json, `Could not create spot (${res.status})`));
  }

  return json as Record<string, unknown>;
}

/**
 * Multipart POST `updateSpot`: `spotData` JSON must include `spot_id` (+ `user_id` / `created_by_id`
 * matching the creator so the backend can authorize). Omit initial-review fields (`rating`, `content`).
 *
 * Optionally append `images` (≤5); send an empty array to update metadata only. The server must
 * implement POST `/api/v1/spots/updateSpot`.
 */
export async function updateSpotMultipart(
  spotData: Record<string, unknown>,
  imageAssets: { uri: string; mimeType?: string | null; fileName?: string | null }[] = [],
): Promise<Record<string, unknown>> {
  if (imageAssets.length > 5) {
    throw new Error("You can attach at most 5 photos.");
  }

  const form = new FormData();
  form.append("spotData", JSON.stringify(spotData));

  for (let i = 0; i < imageAssets.length; i++) {
    const asset = imageAssets[i];
    const rawName =
      asset.fileName?.trim() ||
      asset.uri.split("/").pop()?.split("?")[0] ||
      `image_${i}.jpg`;
    const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase() : "";
    const type =
      asset.mimeType?.trim() ||
      (ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg");
    const name = rawName.includes(".") ? rawName : `${rawName}.jpg`;

    form.append(
      "images",
      {
        uri: asset.uri,
        type,
        name,
      } as unknown as Blob,
    );
  }

  const res = await fetch(`${SPOTS_API_BASE}/updateSpot`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });

  const json = await res.json().catch(() => null);

  if (res.status === 429) {
    throw new Error(
      apiError(json, "Too many updates recently. Wait and try again."),
    );
  }

  if (!res.ok) {
    throw new Error(apiError(json, `Could not update spot (${res.status})`));
  }

  return json as Record<string, unknown>;
}

export async function createReviewMultipart(
  reviewData: Record<string, unknown>,
  imageAssets: { uri: string; mimeType?: string | null; fileName?: string | null }[],
): Promise<void> {
  const form = new FormData();
  form.append("reviewData", JSON.stringify(reviewData));

  for (let i = 0; i < imageAssets.length && i < 5; i++) {
    const asset = imageAssets[i];
    const rawName =
      asset.fileName?.trim() ||
      asset.uri.split("/").pop()?.split("?")[0] ||
      `review_${i}.jpg`;
    const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase() : "";
    const type =
      asset.mimeType?.trim() ||
      (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    const name = rawName.includes(".") ? rawName : `${rawName}.jpg`;
    form.append(
      "images",
      {
        uri: asset.uri,
        type,
        name,
      } as unknown as Blob,
    );
  }

  const res = await fetch(`${SPOTS_API_BASE}/createReview`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });

  const json = await res.json().catch(() => null);
  if (res.status === 429) {
    throw new Error(
      apiError(json, "Too many reviews submitted recently. Please wait."),
    );
  }
  if (!res.ok) {
    throw new Error(apiError(json, `Could not post review (${res.status})`));
  }
}

export async function updateReviewMultipart(
  reviewData: Record<string, unknown>,
  newImageAssets: { uri: string; mimeType?: string | null; fileName?: string | null }[],
): Promise<void> {
  const form = new FormData();
  form.append("reviewData", JSON.stringify(reviewData));

  for (let i = 0; i < newImageAssets.length && i < 5; i++) {
    const asset = newImageAssets[i];
    const rawName =
      asset.fileName?.trim() ||
      asset.uri.split("/").pop()?.split("?")[0] ||
      `review_${i}.jpg`;
    const ext = rawName.includes(".") ? rawName.split(".").pop()?.toLowerCase() : "";
    const type =
      asset.mimeType?.trim() ||
      (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    const name = rawName.includes(".") ? rawName : `${rawName}.jpg`;
    form.append(
      "images",
      {
        uri: asset.uri,
        type,
        name,
      } as unknown as Blob,
    );
  }

  const res = await fetch(`${SPOTS_API_BASE}/updateReview`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });

  const json = await res.json().catch(() => null);
  if (res.status === 429) {
    throw new Error(
      apiError(json, "Too many updates recently. Please wait."),
    );
  }
  if (!res.ok) {
    throw new Error(apiError(json, `Could not update review (${res.status})`));
  }
}

export async function deleteReviewJson(payload: {
  review_id: string;
  spot_id: string;
  user_id: string;
  deleting_user_points?: boolean;
}): Promise<void> {
  const res = await fetch(`${SPOTS_API_BASE}/deleteReview`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      deleting_user_points: payload.deleting_user_points ?? true,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not delete review (${res.status})`));
  }
}

export async function deleteSpotJson(payload: {
  spot_id: string;
  user_id: string;
  deleting_user_points?: boolean;
}): Promise<void> {
  const res = await fetch(`${SPOTS_API_BASE}/deleteSpot`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      deleting_user_points: payload.deleting_user_points ?? true,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(apiError(json, `Could not delete spot (${res.status})`));
  }
}
