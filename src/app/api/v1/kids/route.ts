import { apiKids } from "@/lib/api";
import { caller, unauthorized } from "../_auth";

export const dynamic = "force-dynamic";

// GET /api/v1/kids: who this key can add wishes for, and their lists (default list first).
export function GET(req: Request) {
  const who = caller(req);
  if (!who) return unauthorized();
  return Response.json({ user: { id: who.user.id, name: who.user.name }, kids: apiKids(who.user) });
}
