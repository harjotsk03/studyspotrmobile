/**
 * Tiny on-the-wire format for embedding a "shared resource" inside the body
 * of a chat message. We use a single bracketed token the sender appends to
 * the message body and the receiver scans for; everything else is rendered
 * as normal text.
 *
 *   Wire form: `[[share:<kind>:<id>]]`
 *   Examples:  `[[share:post:8c7d…]]`
 *              `[[share:spot:42a1…]]`
 *              `[[share:community:b7e3…]]`
 *              `[[share:event:<eventId>]]`                  (standalone event)
 *              `[[share:event:<communityId>:<eventId>]]`    (community-scoped)
 *
 * Events can either be standalone or nested under a community. When a
 * community context exists we keep both ids in the token (communityId first,
 * eventId second) so the receiver can hit the community-scoped GET; otherwise
 * we ship just the eventId and the receiver falls back to the standalone
 * event endpoint. All other kinds are flat single-id resources.
 *
 * Kept deliberately small so it survives the existing `body: string` chat
 * schema without server changes. The receiver pulls the message,
 * `extractShareFromBody` strips the token, and the `SharedAttachmentPreview`
 * component fetches the resource by id(s) and renders a LinkedIn-style
 * preview card.
 */

export type SharedAttachmentKind = "post" | "spot" | "community" | "event";

export type SharedAttachmentRef =
  | { kind: "post"; id: string }
  | { kind: "spot"; id: string }
  | { kind: "community"; id: string }
  | { kind: "event"; id: string; communityId: string };

/** Permissive id charset — current backend uses UUIDs, but we accept any
 * URL-safe id token (alphanumerics, `-`, `_`) to stay future-proof. The
 * trailing group captures the optional second id used by event tokens. */
const SHARE_TOKEN_RE =
  /\[\[share:(post|spot|community|event):([A-Za-z0-9_-]+)(?::([A-Za-z0-9_-]+))?\]\]/;

/** Same shape but with the `g` flag so multi-token bodies render every
 * preview rather than only the first one. */
const SHARE_TOKEN_RE_GLOBAL = new RegExp(SHARE_TOKEN_RE.source, "g");

export function encodeShareToken(ref: SharedAttachmentRef): string {
  if (ref.kind === "event") {
    // Standalone events have no community context — emit a single-id token so
    // the receiver doesn't see a malformed `[[share:event::<id>]]` and can
    // still load the preview via the standalone event endpoint.
    const cid = (ref.communityId ?? "").trim();
    if (cid) return `[[share:event:${cid}:${ref.id}]]`;
    return `[[share:event:${ref.id}]]`;
  }
  return `[[share:${ref.kind}:${ref.id}]]`;
}

/** Extract the first share token from a message body, if any.
 *
 * Returns the parsed reference plus the body with the token removed and
 * whitespace tidied so the chat bubble can render the human-readable text
 * alongside the preview card. If no token is present, the original body
 * is returned untouched.
 */
export function extractShareFromBody(body: string): {
  ref: SharedAttachmentRef | null;
  text: string;
} {
  if (typeof body !== "string" || !body) {
    return { ref: null, text: body ?? "" };
  }
  const match = body.match(SHARE_TOKEN_RE);
  if (!match) return { ref: null, text: body };

  const kind = match[1] as SharedAttachmentKind;
  let ref: SharedAttachmentRef | null = null;

  if (kind === "event") {
    // Two valid shapes:
    //   `[[share:event:<communityId>:<eventId>]]` — community-scoped event
    //   `[[share:event:<eventId>]]`               — standalone event
    if (match[3]) {
      ref = { kind: "event", communityId: match[2], id: match[3] };
    } else {
      ref = { kind: "event", communityId: "", id: match[2] };
    }
  } else {
    ref = { kind, id: match[2] };
  }

  const stripped = body
    .replace(SHARE_TOKEN_RE, "")
    // Collapse runs of blank lines we may have left behind so the visual
    // gap above the preview card matches the gap below it.
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { ref, text: stripped };
}

/** Quick check used by callers that need to know whether a message body
 * contains any share metadata without paying the full extract cost. */
export function bodyContainsShareToken(body: string): boolean {
  if (typeof body !== "string" || !body) return false;
  return SHARE_TOKEN_RE.test(body);
}

/** Human-readable summary used in places where we can't render a full
 * preview card (e.g. conversation list previews). */
export function summarizeSharedAttachment(ref: SharedAttachmentRef): string {
  switch (ref.kind) {
    case "post":
      return "Shared a post";
    case "spot":
      return "Shared a study spot";
    case "community":
      return "Shared a community";
    case "event":
      return "Shared an event";
  }
}

/** Rewrite a message body so any `[[share:…]]` tokens are replaced by their
 * human summary ("Shared a post", etc). The remaining text (the caption the
 * sender added) is preserved and the two are joined with " · " so list
 * previews stay readable.
 *
 * Used by the messages list and any other surface that surfaces raw message
 * bodies — we never want users to see the raw bracket syntax. */
export function describeBodyForPreview(body: string): string {
  if (typeof body !== "string" || !body) return body ?? "";
  if (!SHARE_TOKEN_RE.test(body)) return body;

  // Find every token, swap it for its summary, then tidy whitespace.
  const summaries: string[] = [];
  const stripped = body.replace(SHARE_TOKEN_RE_GLOBAL, (match) => {
    const m = match.match(SHARE_TOKEN_RE);
    if (!m) return "";
    const kind = m[1] as SharedAttachmentKind;
    const ref: SharedAttachmentRef =
      kind === "event"
        ? m[3]
          ? { kind: "event", communityId: m[2], id: m[3] }
          : { kind: "event", communityId: "", id: m[2] }
        : { kind, id: m[2] };
    summaries.push(summarizeSharedAttachment(ref));
    return "";
  });

  const text = stripped.replace(/\n{2,}/g, " ").trim();
  if (!summaries.length) return text;
  const tag = summaries[0];
  return text ? `${tag} · ${text}` : tag;
}
