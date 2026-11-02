// Where to send someone after they sign in: the page they were heading to, if it's a page
// inside Wishes. Anything else (other sites, sign-in pages themselves) goes home.

export const PATH_HEADER = "x-wishes-path";

export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/^\/(login|register|auth|api)(\/|\?|$)/.test(raw)) return "/";
  return raw.slice(0, 1000);
}

// "?next=..." for a sign-in link, or "" when it would just lead home.
export function nextQuery(raw: unknown, join: "?" | "&" = "?"): string {
  const next = safeNext(raw);
  return next === "/" ? "" : `${join}next=${encodeURIComponent(next)}`;
}
