import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, CALLBACK_PATH, discover, oidcConfig, pkcePair } from "@/lib/oidc";
import { randomToken } from "@/lib/crypto";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/next";

// ?link=1 from Settings attaches the login to whoever is signed in, instead of signing in.
export async function GET(req: Request) {
  const base = appUrl(req.url, await headers());
  const params = new URL(req.url).searchParams;
  const link = params.get("link") === "1";
  const cfg = oidcConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?error=Single+sign-on+is+not+set+up", base));
  if (link && !(await getUser())) return NextResponse.redirect(new URL("/login?next=%2Fsettings%3Ftab%3Dsecurity", base));
  let doc;
  try {
    doc = await discover(cfg);
  } catch (e) {
    console.error(e);
    const msg = `Couldn't reach ${cfg.name}. Try again in a minute.`;
    return NextResponse.redirect(new URL(`${link ? "/settings?tab=security&" : "/login?"}error=${encodeURIComponent(msg)}`, base));
  }
  const { verifier, challenge } = pkcePair();
  const state = randomToken(16);
  const nonce = randomToken(16);
  const redirectUri = `${base}${CALLBACK_PATH}`;
  (await cookies()).set("wishes_oidc", JSON.stringify({ state, verifier, nonce, link, next: safeNext(params.get("next")) }), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 600,
    secure: redirectUri.startsWith("https://"),
  });
  const url = new URL(doc.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: cfg.scopes,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return NextResponse.redirect(url);
}
