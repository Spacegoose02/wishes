import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { get, run, tx } from "./db";
import { randomToken, sha256 } from "./crypto";
import type { User } from "./types";
import { nextQuery, PATH_HEADER } from "./next";

const COOKIE = "wishes_session";
const SESSION_DAYS = 30;

async function isSecure(): Promise<boolean> {
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE === "true";
  const h = await headers();
  return h.get("x-forwarded-proto") === "https";
}

export async function createSession(userId: number, pending2fa = false) {
  const token = randomToken();
  const expires = Math.floor(Date.now() / 1000) + (pending2fa ? 600 : SESSION_DAYS * 86400);
  run("INSERT INTO sessions (id, user_id, pending_2fa, expires_at) VALUES (?, ?, ?, ?)", sha256(token), userId, pending2fa ? 1 : 0, expires);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isSecure(),
    path: "/",
    maxAge: pending2fa ? 600 : SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE id = ?", sha256(token));
  jar.delete(COOKIE);
}

async function sessionRow() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return undefined;
  return get<{ id: string; user_id: number; pending_2fa: number; expires_at: number }>(
    "SELECT * FROM sessions WHERE id = ? AND expires_at > unixepoch()",
    sha256(token),
  );
}

export async function getUser(): Promise<User | undefined> {
  const s = await sessionRow();
  if (s && !s.pending_2fa) return get<User>("SELECT * FROM users WHERE id = ?", s.user_id);
  if (!s) return proxyHeaderUser();
  return undefined;
}

// Forward-auth support (Tinyauth, Authelia, Authentik proxy outposts): trust the email
// header set by the reverse proxy. Only enable when the app is unreachable except via the proxy.
async function proxyHeaderUser(): Promise<User | undefined> {
  const headerName = process.env.TRUSTED_EMAIL_HEADER;
  if (!headerName) return undefined;
  const h = await headers();
  const email = h.get(headerName)?.trim().toLowerCase();
  if (!email || !email.includes("@")) return undefined;
  let u = get<User>("SELECT * FROM users WHERE email = ?", email);
  if (!u) {
    const name = h.get(process.env.TRUSTED_NAME_HEADER || "remote-name") || email.split("@")[0];
    const id = createUser({ email, name });
    u = get<User>("SELECT * FROM users WHERE id = ?", id);
  }
  return u;
}

export async function getPending2faUser(): Promise<User | undefined> {
  const s = await sessionRow();
  if (!s || !s.pending_2fa) return undefined;
  return get<User>("SELECT * FROM users WHERE id = ?", s.user_id);
}

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) {
    // Server actions post to the page they're on, so this is the page either way.
    const h = await headers();
    redirect(`/login${h.get("next-action") ? "" : nextQuery(h.get(PATH_HEADER))}`);
  }
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (!u.is_admin) redirect("/");
  return u;
}

export function userCount(): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM users")!.n;
}

export function signupAllowed(): boolean {
  if (userCount() === 0) return true; // first user bootstraps the instance as admin
  return (process.env.ALLOW_SIGNUP ?? "true") !== "false";
}

export function createUser(opts: { email: string; name: string; passwordHash?: string | null; oidcSub?: string | null; avatar?: string }): number {
  return tx(() => {
    const first = userCount() === 0;
    const r = run(
      "INSERT INTO users (email, name, password_hash, oidc_sub, avatar, is_admin) VALUES (?, ?, ?, ?, ?, ?)",
      opts.email.trim().toLowerCase(),
      opts.name.trim(),
      opts.passwordHash ?? null,
      opts.oidcSub ?? null,
      opts.avatar ?? "raccoon",
      first ? 1 : 0,
    );
    const id = Number(r.lastInsertRowid);
    run("INSERT INTO profiles (user_id, name, avatar, is_primary) VALUES (?, ?, ?, 1)", id, opts.name.trim(), opts.avatar ?? "raccoon");
    return id;
  });
}
