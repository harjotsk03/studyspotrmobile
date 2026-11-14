import { File } from "expo-file-system";

/**
 * Build a multipart file part for `FormData.append`.
 *
 * Expo SDK 55+ ships its own `fetch` that serialises multipart bodies itself.
 * It no longer understands React Native's `{ uri, name, type }` file objects
 * ("Unsupported FormDataPart implementation") — a part must be a string, a
 * Blob, or an object exposing `bytes()`. This returns the latter, reading the
 * local file lazily when the request body is built, and keeps `name` / `type`
 * so the server still sees the filename and mimetype.
 */
export function filePart(file: {
  uri: string;
  name: string;
  type: string;
}): Blob {
  return {
    name: file.name,
    type: file.type,
    bytes: async () => new Uint8Array(await new File(file.uri).arrayBuffer()),
  } as unknown as Blob;
}
