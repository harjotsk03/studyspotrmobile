export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.EXPO_PUBLIC_API_URL ??
  "https://studyspotrserver.onrender.com"
).replace(/\/+$/, "");