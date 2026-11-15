import "server-only";
import crypto from "node:crypto";
import { randomToken } from "./crypto";
import { getSetting } from "./db";

// Generic OpenID Connect (authorization code + PKCE). Works with Tinyauth, Authelia,
// Authentik, Pocket ID, Keycloak, Google, etc.
//
// Set up in Settings → Server → Single sign-on. Each value saved there wins; anything
// never saved falls back to the matching OIDC_* environment variable.
export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  name: string;
  /** Always "openid profile email", plus any extras. */
  scopes: string;
  extraScopes: string;
  /** Make a Wishes account for someone who signs in with no account yet. */
  autoCreate: boolean;
  /** Show the "Sign in with …" button on the sign-in page. */
  showButton: boolean;
  /** Skip the Wishes 2FA code when the provider already did its own. */
  skip2fa: boolean;
  /** Family new accounts join, or null. */
  familyId: number | null;
};

const BASE_SCOPES = ["openid", "profile", "email"];

function pick(key: string, env: string): string | undefined {
  const saved = getSetting(key);
  return saved !== undefined ? saved : process.env[env];
}

function flag(key: string, env: string, fallback: boolean): boolean {
  const v = pick(key, env);
  if (v === undefined || v === "") return fallback;
  return v === "1" || v === "true";
}

export function joinScopes(extra: string): string {
  const words = [...BASE_SCOPES, ...extra.split(/[\s,]+/).filter(Boolean)];
  return [...new Set(words)].join(" ");
}

/** Everything saved, even if not complete enough to sign anyone in. For the admin form. */
export function oidcSettings(): OidcConfig {
  const extra = pick("oidc_scopes", "OIDC_SCOPES") ?? "";
  const extraScopes = extra.split(/[\s,]+/).filter((w) => w && !BASE_SCOPES.includes(w)).join(" ");
  const family = Number(getSetting("oidc_family_id") || 0);
  return {
    issuer: (pick("oidc_issuer", "OIDC_ISSUER") ?? "").trim().replace(/\/+$/, ""),
    clientId: (pick("oidc_client_id", "OIDC_CLIENT_ID") ?? "").trim(),
    clientSecret: pick("oidc_client_secret", "OIDC_CLIENT_SECRET") ?? "",
    name: pick("oidc_name", "OIDC_NAME") || "Single sign-on",
    scopes: joinScopes(extraScopes),
    extraScopes,
    autoCreate: flag("oidc_auto_create", "OIDC_AUTO_CREATE", true),
    showButton: flag("oidc_show_button", "OIDC_SHOW_BUTTON", true),
    skip2fa: flag("oidc_skip_2fa", "OIDC_SKIP_2FA", false),
    familyId: Number.isInteger(family) && family > 0 ? family : null,
  };
}

/** The provider, when it's set up well enough to use; otherwise null. */
export function oidcConfig(): OidcConfig | null {
  const cfg = oidcSettings();
  if (!cfg.issuer || !cfg.clientId) return null;
  return cfg;
}

type Discovery = { issuer?: string; authorization_endpoint: string; token_endpoint: string; userinfo_endpoint?: string };
let cached: { issuer: string; doc: Discovery; at: number } | null = null;

export function forgetDiscovery() {
  cached = null;
}

export async function discover(cfg: Pick<OidcConfig, "issuer">): Promise<Discovery> {
  if (cached && cached.issuer === cfg.issuer && Date.now() - cached.at < 3600_000) return cached.doc;
  const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const doc = (await res.json()) as Discovery;
  if (!doc.authorization_endpoint || !doc.token_endpoint) throw new Error("OIDC discovery document is missing its endpoints");
  cached = { issuer: cfg.issuer, doc, at: Date.now() };
  return doc;
}

export function pkcePair() {
  const verifier = randomToken(32);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// The public address the provider sends people back to. APP_URL wins, then the site
// address saved under Email, then whatever the reverse proxy says the request came in on.
export function appUrl(reqUrl: string, h?: Headers): string {
  const fixed = process.env.APP_URL || getSetting("site_url");
  if (fixed) return fixed.replace(/\/+$/, "");
  const host = h?.get("x-forwarded-host");
  if (host) return `${h?.get("x-forwarded-proto") ?? "https"}://${host.split(",")[0].trim()}`;
  return new URL(reqUrl).origin;
}

export const CALLBACK_PATH = "/auth/oidc/callback";

export type OidcClaims = { sub: string; email?: string; name?: string; preferred_username?: string; email_verified?: boolean | string; nonce?: string };

export async function exchangeCode(cfg: OidcConfig, code: string, verifier: string, redirectUri: string, nonce?: string): Promise<OidcClaims> {
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
  const res = await fetch(doc.token_endpoint, { method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OIDC token exchange failed: ${res.status} ${await res.text()}`);
  const tok = (await res.json()) as { access_token?: string; id_token?: string };

  // The ID token came straight from the token endpoint over TLS, so its claims can be
  // trusted without signature verification (OIDC Core 3.1.3.7). Prefer userinfo when present.
  let claims: Partial<OidcClaims> = {};
  if (tok.id_token) {
    const payload = tok.id_token.split(".")[1];
    if (payload) claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (nonce && claims.nonce && claims.nonce !== nonce) throw new Error("OIDC nonce did not match");
  }
  const idSub = claims.sub;
  if (doc.userinfo_endpoint && tok.access_token) {
    const ui = await fetch(doc.userinfo_endpoint, { headers: { authorization: `Bearer ${tok.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (ui.ok) claims = { ...claims, ...((await ui.json()) as Partial<OidcClaims>) };
  }
  // Userinfo must describe the same person as the ID token (OIDC Core 5.3.2).
  if (idSub && claims.sub !== idSub) throw new Error("OIDC userinfo subject did not match the ID token");
  if (!claims.sub) throw new Error("OIDC response had no subject");
  return claims as OidcClaims;
}
