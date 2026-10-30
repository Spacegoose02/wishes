"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "@/lib/db";
import { createSession, createUser, destroySession, getPending2faUser, requireUser, signupAllowed } from "@/lib/auth";
import { hashPassword, newTotpSecret, verifyPassword, verifyTotp } from "@/lib/crypto";
import type { User } from "@/lib/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// Small in-memory throttle for password/TOTP guesses: per account, and per address so one
// client can't spray guesses across many accounts.
const attempts = new Map<string, { n: number; until: number }>();
const LIMITS = { account: 8, ip: 30 };
function throttled(key: string, max = LIMITS.account): boolean {
  const a = attempts.get(key);
  if (a && a.until <= Date.now()) attempts.delete(key);
  return !!a && a.n >= max && a.until > Date.now();
}
function fail(...keys: string[]) {
  for (const key of keys) {
    const a = attempts.get(key) ?? { n: 0, until: 0 };
    a.n++;
    a.until = Date.now() + 10 * 60_000;
    attempts.set(key, a);
  }
}
async function clientIp(): Promise<string> {
  const h = await headers();
  return `ip:${h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local"}`;
}

export async function login(form: FormData) {
  if (process.env.DISABLE_PASSWORD_LOGIN === "true") redirect("/login?error=Password+sign-in+is+disabled");
  const email = s(form, "email").toLowerCase();
  const ip = await clientIp();
  if (throttled(email) || throttled(ip, LIMITS.ip)) redirect("/login?error=Too+many+attempts.+Try+again+in+a+few+minutes.");
  const user = get<User>("SELECT * FROM users WHERE email = ?", email);
  if (!user || !verifyPassword(s(form, "password"), user.password_hash)) {
    fail(email, ip);
    redirect("/login?error=Wrong+email+or+password");
  }
  attempts.delete(email);
  await createSession(user.id, !!user.totp_enabled);
  redirect(user.totp_enabled ? "/login/2fa" : "/");
}

export async function register(form: FormData) {
  if (!signupAllowed()) redirect("/login?error=Sign-ups+are+closed");
  const email = s(form, "email").toLowerCase();
  const name = s(form, "name");
  const password = s(form, "password");
  if (!email.includes("@") || !name) redirect("/register?error=Please+fill+in+your+name+and+email");
  if (password.length < 8) redirect("/register?error=Password+must+be+at+least+8+characters");
  if (get("SELECT 1 FROM users WHERE email = ?", email)) redirect("/register?error=That+email+already+has+an+account");
  const id = createUser({ email, name, passwordHash: hashPassword(password), avatar: s(form, "avatar") || "raccoon" });
  await createSession(id);
  redirect("/?welcome=1");
}

export async function verify2fa(form: FormData) {
  const user = await getPending2faUser();
  if (!user || !user.totp_secret) redirect("/login");
  const key = `totp:${user.id}`;
  if (throttled(key) || !verifyTotp(user.totp_secret, s(form, "code"))) {
    fail(key);
    redirect("/login/2fa?error=That+code+didn't+work");
  }
  await destroySession();
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function startTotp() {
  const user = await requireUser();
  run("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?", newTotpSecret(), user.id);
  redirect("/settings?tab=security");
}

export async function confirmTotp(form: FormData) {
  const user = await requireUser();
  if (!user.totp_secret || !verifyTotp(user.totp_secret, s(form, "code"))) redirect("/settings?tab=security&error=That+code+didn't+match.+Try+the+newest+one.");
  run("UPDATE users SET totp_enabled = 1 WHERE id = ?", user.id);
  redirect("/settings?tab=security&ok=Two-factor+sign-in+is+on");
}

export async function disableTotp(form: FormData) {
  const user = await requireUser();
  if (user.totp_enabled && (!user.totp_secret || !verifyTotp(user.totp_secret, s(form, "code")))) {
    redirect("/settings?tab=security&error=Enter+a+current+code+to+turn+it+off");
  }
  run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", user.id);
  redirect("/settings?tab=security&ok=Two-factor+sign-in+is+off");
}

export async function changePassword(form: FormData) {
  const user = await requireUser();
  if (user.password_hash && !verifyPassword(s(form, "current"), user.password_hash)) redirect("/settings?tab=security&error=Current+password+is+wrong");
  const next = s(form, "password");
  if (next.length < 8) redirect("/settings?tab=security&error=Password+must+be+at+least+8+characters");
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), user.id);
  run("DELETE FROM sessions WHERE user_id = ? AND pending_2fa = 0 AND rowid NOT IN (SELECT MAX(rowid) FROM sessions WHERE user_id = ?)", user.id, user.id);
  redirect("/settings?tab=security&ok=Password+updated");
}
