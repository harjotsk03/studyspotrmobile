import { API_BASE_URL } from "../constants/Api";

/**
 * studyspotrserver: `POST /api/v1/auth/update-profile-photo`
 * — `multipart/form-data` with exactly one file field named **`image`**.
 */

const UPDATE_PROFILE_PHOTO_URL = `${API_BASE_URL}/api/v1/auth/update-profile-photo`;

function getApiError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const o = json as Record<string, unknown>;
  const e = o.error;
  const m = o.message;
  if (typeof e === "string" && e.trim()) return e.trim();
  if (typeof m === "string" && m.trim()) return m.trim();
  return fallback;
}

/**
 * Multipart POST; do not set `Content-Type` (RN sets boundary).
 */
export async function postProfilePhotoMultipart(options: {
  token: string;
  localUri: string;
  contentType: string;
  filename: string;
}): Promise<unknown> {
  const { token, localUri, contentType, filename } = options;

  const formData = new FormData();
  formData.append(
    "image",
    {
      uri: localUri,
      type: contentType,
      name: filename,
    } as unknown as Blob,
  );

  const res = await fetch(UPDATE_PROFILE_PHOTO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      getApiError(data, `Photo upload failed (${res.status})`),
    );
  }

  return data;
}
