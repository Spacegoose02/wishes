import "server-only";
import crypto from "node:crypto";
import { randomToken } from "./crypto";

// Generic OpenID Connect (authorization code + PKCE). Works with Tinyauth, Authelia,
// Authentik, Pocket ID, Keycloak, Google, etc.
export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  name: string;
  scopes: string;
};

export function oidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!issuer || !clientId) return null;
  return {
    issuer: issuer.replace(/\/$/, ""),
    clientId,
    clientSecret: process.env.OIDC_CLIENT_SECRET || "",
    name: process.env.OIDC_NAME || "Single sign-on",
    scopes: process.env.OIDC_SCOPES || "openid profile email",
  };
}

type Discovery = { authorization_endpoint: string; token_endpoint: string; userinfo_endpoint?: string };
let cached: { issuer: string; doc: Discovery; at: number } | null = null;

export async function discover(cfg: OidcConfig): Promise<Discovery> {
  if (cached && cached.issuer === cfg.issuer && Date.now() - cached.at < 3600_000) return cached.doc;
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const doc = (await res.json()) as Discovery;
  cached = { issuer: cfg.issuer, doc, at: Date.now() };
  return doc;
}

export function pkcePair() {
  const verifier = randomToken(32);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function appUrl(reqUrl: string): string {
  return (process.env.APP_URL || new URL(reqUrl).origin).replace(/\/$/, "");
}

export type OidcClaims = { sub: string; email?: string; name?: string; preferred_username?: string; email_verified?: boolean };

export async function exchangeCode(cfg: OidcConfig, code: string, verifier: string, redirectUri: string): Promise<OidcClaims> {
  const doc = await discover(cfg);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: cfg.clientId,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (cfg.clientSecret) {
    headers.authorization = "Basic " + Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64");
  }
  const res = await fetch(doc.token_endpoint, { method: "POST", headers, body, cache: "no-store" });
  if (!res.ok) throw new Error(`OIDC token exchange failed: ${res.status} ${await res.text()}`);
  const tok = (await res.json()) as { access_token?: string; id_token?: string };

  // The ID token came straight from the token endpoint over TLS, so its claims can be
  // trusted without signature verification (OIDC Core 3.1.3.7). Prefer userinfo when present.
  let claims: Partial<OidcClaims> = {};
  if (tok.id_token) {
    const payload = tok.id_token.split(".")[1];
    if (payload) claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  }
  if (doc.userinfo_endpoint && tok.access_token) {
    const ui = await fetch(doc.userinfo_endpoint, { headers: { authorization: `Bearer ${tok.access_token}` }, cache: "no-store" });
    if (ui.ok) claims = { ...claims, ...((await ui.json()) as Partial<OidcClaims>) };
  }
  if (!claims.sub) throw new Error("OIDC response had no subject");
  return claims as OidcClaims;
}
