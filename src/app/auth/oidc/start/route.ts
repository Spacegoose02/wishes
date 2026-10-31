import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appUrl, discover, oidcConfig, pkcePair } from "@/lib/oidc";
import { randomToken } from "@/lib/crypto";
import { safeNext } from "@/lib/next";

export async function GET(req: Request) {
  const cfg = oidcConfig();
  if (!cfg) return NextResponse.redirect(new URL("/login?error=Single+sign-on+is+not+configured", appUrl(req.url)));
  const doc = await discover(cfg);
  const { verifier, challenge } = pkcePair();
  const state = randomToken(16);
  const nonce = randomToken(16);
  const redirectUri = `${appUrl(req.url)}/auth/oidc/callback`;
  (await cookies()).set("wishes_oidc", JSON.stringify({ state, verifier, nonce, next: safeNext(new URL(req.url).searchParams.get("next")) }), {
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
