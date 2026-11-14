import "server-only";
import { all, get, run } from "./db";
import { randomToken, sha256 } from "./crypto";
import type { User } from "./types";

// API keys let another app (like Den Duty) add wishes for the kids a grown-up manages.
// A key acts as the person who made it, can only use the /api/v1 endpoints, and is shown once:
// only its hash is stored. Deleting it ("Revoke") stops it right away.

export const TOKEN_PREFIX = "wsh_";
export const MAX_TOKENS = 20;

export type ApiToken = { id: number; name: string; last_used_at: number | null; created_at: number };

export function createApiToken(userId: number, name: string): { ok: true; token: string; id: number } | { ok: false; error: string } {
  const label = name.trim().slice(0, 60);
  if (!label) return { ok: false, error: "Give the key a name, like the app that will use it." };
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?", userId)!.n;
  if (count >= MAX_TOKENS) return { ok: false, error: `That's ${MAX_TOKENS} keys already. Revoke one you don't use first.` };
  const token = TOKEN_PREFIX + randomToken(24);
  const id = Number(run("INSERT INTO api_tokens (user_id, name, token_hash) VALUES (?, ?, ?)", userId, label, sha256(token)).lastInsertRowid);
  return { ok: true, token, id };
}

export function listApiTokens(userId: number): ApiToken[] {
  return all<ApiToken>("SELECT id, name, last_used_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id DESC", userId);
}

export function revokeApiToken(userId: number, id: number): boolean {
  return Number(run("DELETE FROM api_tokens WHERE id = ? AND user_id = ?", id, userId).changes) > 0;
}

// The person (and key name) behind an "Authorization: Bearer wsh_..." header, or undefined.
export function apiCaller(authorization: string | null, now = Date.now()): { user: User; tokenName: string } | undefined {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!m || !m[1].startsWith(TOKEN_PREFIX)) return undefined;
  const row = get<{ id: number; user_id: number; name: string; last_used_at: number | null }>(
    "SELECT id, user_id, name, last_used_at FROM api_tokens WHERE token_hash = ?", sha256(m[1]),
  );
  if (!row) return undefined;
  const user = get<User>("SELECT * FROM users WHERE id = ?", row.user_id);
  if (!user) return undefined;
  const secs = Math.floor(now / 1000);
  // Once a minute is plenty for "last used", and spares a write on every call.
  if (!row.last_used_at || secs - row.last_used_at >= 60) run("UPDATE api_tokens SET last_used_at = ? WHERE id = ?", secs, row.id);
  return { user, tokenName: row.name };
}
