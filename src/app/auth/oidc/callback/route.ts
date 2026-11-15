import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, CALLBACK_PATH, exchangeCode, oidcConfig } from "@/lib/oidc";
import { createSession, getUser } from "@/lib/auth";
import { linkSso, resolveSso } from "@/lib/sso";
import { nextQuery, safeNext } from "@/lib/next";

export async function GET(req: Request) {
  const base = appUrl(req.url, await headers());
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const raw = jar.get("wishes_oidc")?.value;
  jar.delete("wishes_oidc");
  let saved: { state: string; verifier: string; nonce: string; link?: boolean; next?: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const linking = !!saved?.link;
  const back = (msg: string) =>
    NextResponse.redirect(new URL(`${linking ? "/settings?tab=security&" : "/login?"}error=${encodeURIComponent(msg)}`, base));

  const cfg = oidcConfig();
  if (!cfg) return back("Single sign-on is not set up");
  if (params.get("error")) return back(params.get("error_description") || params.get("error")!);
  if (!saved) return back("Sign-in expired, please try again");
  const next = safeNext(saved.next);
  if (params.get("state") !== saved.state || !params.get("code")) return back("Sign-in could not be verified");

  let claims;
  try {
    claims = await exchangeCode(cfg, params.get("code")!, saved.verifier, `${base}${CALLBACK_PATH}`, saved.nonce);
  } catch (e) {
    console.error(e);
    return back(`${cfg.name} rejected the request`);
  }

  if (linking) {
    // Link to the account signed in right now, never to an id from the cookie.
    const me = await getUser();
    if (!me) return back("Sign in to Wishes first, then link your account");
    const r = linkSso(me, claims, cfg);
    if (!r.ok) return back(r.error);
    return NextResponse.redirect(new URL(`/settings?tab=security&ok=${encodeURIComponent(`Linked. You can sign in with ${cfg.name} now.`)}`, base));
  }

  const r = resolveSso(claims, cfg);
  if (!r.ok) return back(r.error);
  const user = r.user;
  const need2fa = !!user.totp_enabled && !cfg.skip2fa;
  await createSession(user.id, need2fa);
  if (need2fa) return NextResponse.redirect(new URL(`/login/2fa${nextQuery(next)}`, base));
  return NextResponse.redirect(new URL(r.created ? "/?welcome=1" : next, base));
}
