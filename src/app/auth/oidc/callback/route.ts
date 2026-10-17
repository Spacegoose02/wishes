import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, exchangeCode, oidcConfig } from "@/lib/oidc";
import { createSession, createUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import type { User } from "@/lib/types";

export async function GET(req: Request) {
  const base = appUrl(req.url);
  const back = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, base));
  const cfg = oidcConfig();
  if (!cfg) return back("Single sign-on is not configured");

  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const raw = jar.get("wishes_oidc")?.value;
  jar.delete("wishes_oidc");
  if (params.get("error")) return back(params.get("error_description") || params.get("error")!);
  if (!raw) return back("Sign-in expired, please try again");
  const saved = JSON.parse(raw) as { state: string; verifier: string; nonce: string };
  if (params.get("state") !== saved.state || !params.get("code")) return back("Sign-in could not be verified");

  let claims;
  try {
    claims = await exchangeCode(cfg, params.get("code")!, saved.verifier, `${base}/auth/oidc/callback`);
  } catch (e) {
    console.error(e);
    return back("The sign-in provider rejected the request");
  }

  let user = get<User>("SELECT * FROM users WHERE oidc_sub = ?", claims.sub);
  const email = claims.email?.toLowerCase();
  if (!user && email) {
    user = get<User>("SELECT * FROM users WHERE email = ?", email);
    if (user) run("UPDATE users SET oidc_sub = ? WHERE id = ?", claims.sub, user.id);
  }
  if (!user) {
    if (process.env.OIDC_AUTO_CREATE === "false") return back("No Wishes account exists for that login");
    if (!email) return back("Your sign-in provider didn't share an email address");
    const id = createUser({ email, name: claims.name || claims.preferred_username || email.split("@")[0], oidcSub: claims.sub });
    user = get<User>("SELECT * FROM users WHERE id = ?", id)!;
  }
  const need2fa = !!user.totp_enabled && process.env.OIDC_SKIP_2FA !== "true";
  await createSession(user.id, need2fa);
  return NextResponse.redirect(new URL(need2fa ? "/login/2fa" : "/", base));
}
