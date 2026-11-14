/** "very_quiet" / "very quiet" -> "Very Quiet". Leaves existing capitals alone. */
export function titleCase(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(/])([a-z])/g, (_, lead: string, ch: string) =>
      lead + ch.toUpperCase(),
    );
}
