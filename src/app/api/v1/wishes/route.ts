import { apiAddWish } from "@/lib/api";
import { siteOrigin } from "@/lib/origin";
import { caller, MAX_BODY, unauthorized } from "../_auth";

export const dynamic = "force-dynamic";

// POST /api/v1/wishes: add a wish to a kid's list. See docs/api.md.
export async function POST(req: Request) {
  const who = caller(req);
  if (!who) return unauthorized();
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "That request is too big." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Send the wish as JSON." }, { status: 400 });
  }
  const r = apiAddWish(who.user, who.tokenName, body, await siteOrigin());
  return Response.json(r.body, { status: r.status });
}
