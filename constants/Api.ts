export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.EXPO_PUBLIC_API_URL ??
  "http://192.168.1.89:3004"
).replace(/\/+$/, "");