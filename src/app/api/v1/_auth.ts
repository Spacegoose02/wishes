import "server-only";
import { apiCaller } from "@/lib/apitokens";

// Every /api/v1 call needs "Authorization: Bearer wsh_..." with a key made in Settings → Sign-in & 2FA.
export function caller(req: Request) {
  return apiCaller(req.headers.get("authorization"));
}

export const unauthorized = () =>
  Response.json({ error: "Missing or unknown API key. Send it as: Authorization: Bearer wsh_..." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

export const MAX_BODY = 16_000;
