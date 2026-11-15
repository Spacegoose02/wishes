import "server-only";
import { get, run } from "./db";
import { createUser } from "./auth";
import type { OidcClaims, OidcConfig } from "./oidc";
import type { User } from "./types";

// Who a single sign-on login belongs to in Wishes.
//
// Wishes accounts are grown-ups: each owns a primary profile and can add kid profiles
// that don't need a login. So an account made from an SSO login is always a regular
// (non-admin) grown-up account, never a kid. If the admin picked a family, it joins
// that family as a member so the new person sees family lists straight away.

export type SsoResult = { ok: true; user: User; created?: boolean; linked?: boolean } | { ok: false; error: string };

type Cfg = Pick<OidcConfig, "name" | "autoCreate" | "familyId">;

const byId = (id: number) => get<User>("SELECT * FROM users WHERE id = ?", id)!;

function emailTrusted(claims: OidcClaims): boolean {
  // Providers that say the address isn't verified don't get to claim an existing account.
  return claims.email_verified !== false && claims.email_verified !== "false";
}

/** Attach this login to someone already signed in to Wishes (Settings → Sign-in & 2FA). */
export function linkSso(user: User, claims: OidcClaims, cfg: Pick<OidcConfig, "name">): SsoResult {
  const owner = get<User>("SELECT * FROM users WHERE oidc_sub = ?", claims.sub);
  if (owner && owner.id !== user.id) return { ok: false, error: `That ${cfg.name} login is already linked to another Wishes account` };
  run("UPDATE users SET oidc_sub = ?, sso_link_email = NULL WHERE id = ?", claims.sub, user.id);
  return { ok: true, user: byId(user.id), linked: true };
}

export function unlinkSso(user: User): SsoResult {
  if (process.env.DISABLE_PASSWORD_LOGIN === "true") return { ok: false, error: "Password sign-in is off on this server, so unlinking would lock you out" };
  if (!user.password_hash) return { ok: false, error: "Set a password first, or you won't have a way to sign in" };
  run("UPDATE users SET oidc_sub = NULL WHERE id = ?", user.id);
  return { ok: true, user: byId(user.id) };
}

/** Find, link or make the account for a sign-in from the provider. */
export function resolveSso(claims: OidcClaims, cfg: Cfg): SsoResult {
  const known = get<User>("SELECT * FROM users WHERE oidc_sub = ?", claims.sub);
  if (known) return { ok: true, user: known };

  const email = claims.email?.trim().toLowerCase();
  if (email && emailTrusted(claims)) {
    // An admin said this login belongs to someone (Settings → Server → People).
    const chosen = get<User>("SELECT * FROM users WHERE sso_link_email = ? AND oidc_sub IS NULL ORDER BY id LIMIT 1", email);
    if (chosen) {
      run("UPDATE users SET oidc_sub = ?, sso_link_email = NULL WHERE id = ?", claims.sub, chosen.id);
      return { ok: true, user: byId(chosen.id), linked: true };
    }
    const match = get<User>("SELECT * FROM users WHERE email = ?", email);
    if (match) {
      // Already tied to a different login at the provider: don't quietly swap it.
      if (match.oidc_sub) return { ok: false, error: `${email} is linked to a different ${cfg.name} login` };
      run("UPDATE users SET oidc_sub = ? WHERE id = ?", claims.sub, match.id);
      return { ok: true, user: byId(match.id), linked: true };
    }
  }

  if (!cfg.autoCreate) {
    return {
      ok: false,
      error: `There's no Wishes account for ${email || "that login"} yet. Sign in with your password and link ${cfg.name} under Settings, or ask whoever runs Wishes to turn on new accounts.`,
    };
  }
  if (!email) return { ok: false, error: `${cfg.name} didn't share an email address, so Wishes can't make an account` };
  if (!emailTrusted(claims)) return { ok: false, error: `${cfg.name} says ${email} isn't verified yet` };
  if (get("SELECT 1 FROM users WHERE email = ?", email)) return { ok: false, error: `${email} already has a Wishes account` };

  const name = (claims.name || claims.preferred_username || email.split("@")[0]).slice(0, 80);
  const id = createUser({ email, name, oidcSub: claims.sub });
  if (cfg.familyId && get("SELECT 1 FROM families WHERE id = ?", cfg.familyId)) {
    run("INSERT OR IGNORE INTO family_members (family_id, user_id, role) VALUES (?, ?, 'member')", cfg.familyId, id);
  }
  return { ok: true, user: byId(id), created: true };
}

/** Admin: link someone's account the next time this email signs in with the provider. */
export function adminLinkSso(userId: number, email: string): SsoResult {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return { ok: false, error: "Type the email their login server has for them" };
  const other = get<User>("SELECT * FROM users WHERE id != ? AND (sso_link_email = ? OR (email = ? AND oidc_sub IS NULL))", userId, e, e);
  if (other) return { ok: false, error: `${e} already belongs to ${other.name}` };
  run("UPDATE users SET sso_link_email = ? WHERE id = ?", e, userId);
  return { ok: true, user: byId(userId) };
}

/** Admin: take the provider login off someone's account (they can link again later). */
export function adminUnlinkSso(userId: number): SsoResult {
  run("UPDATE users SET oidc_sub = NULL, sso_link_email = NULL WHERE id = ?", userId);
  return { ok: true, user: byId(userId) };
}
