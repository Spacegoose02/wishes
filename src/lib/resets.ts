import "server-only";
import { get, run, tx } from "./db";
import { randomToken, sha256 } from "./crypto";

// Password reset links: single use, short-lived, and only the hash is stored.

export const EMAIL_RESET_HOURS = 1;
export const ADMIN_RESET_HOURS = 24;

export function createReset(userId: number, hours: number, now = Date.now()): string {
  const token = randomToken(24);
  // A new link replaces any older one that hasn't been used.
  run("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL", userId);
  run("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)", sha256(token), userId, Math.floor(now / 1000) + hours * 3600);
  return token;
}

export function resetUser(token: string, now = Date.now()): number | undefined {
  if (!token) return undefined;
  return get<{ user_id: number }>(
    "SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
    sha256(token), Math.floor(now / 1000),
  )?.user_id;
}

// Sets the new password and signs the person out everywhere. False if the link is no good.
export function redeemReset(token: string, passwordHash: string, now = Date.now()): number | undefined {
  return tx(() => {
    const uid = resetUser(token, now);
    if (!uid) return undefined;
    run("UPDATE password_resets SET used_at = ? WHERE token_hash = ?", Math.floor(now / 1000), sha256(token));
    run("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, uid);
    run("DELETE FROM sessions WHERE user_id = ?", uid);
    return uid;
  });
}
