"use server";
import { redirect } from "next/navigation";
import { run, setSetting } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PROVIDERS, type AiProvider } from "@/lib/ai";
import { mailFrom, sendMail } from "@/lib/mail";
import { ADMIN_RESET_HOURS, createReset } from "@/lib/resets";
import { setRegion } from "@/lib/format";
import { CURRENCIES, LOCALES } from "@/lib/regions";
import { discover, forgetDiscovery, joinScopes } from "@/lib/oidc";
import { adminLinkSso, adminUnlinkSso } from "@/lib/sso";
import { s, n } from "./_shared";

export async function saveAiSettings(form: FormData) {
  await requireAdmin();
  const provider = s(form, "provider") as AiProvider;
  if (!PROVIDERS.some((p) => p.id === provider)) redirect("/settings?tab=admin&error=Unknown+provider");
  setSetting("ai_provider", provider);
  setSetting("ai_model", s(form, "model"));
  setSetting("ai_base_url", s(form, "base_url"));
  if (s(form, "api_key")) setSetting("ai_api_key", s(form, "api_key"));
  if (form.get("clear_key")) setSetting("ai_api_key", "");
  setSetting("ai_web_search", form.get("web_search") ? "1" : "0");
  const cap = Number(s(form, "chat_daily_cap"));
  if (Number.isInteger(cap) && cap >= 0) setSetting("chat_daily_cap", String(Math.min(cap, 10000)));
  redirect("/settings?tab=admin&ok=AI+settings+saved");
}

export async function saveScrapeSettings(form: FormData) {
  await requireAdmin();
  const fsUrl = s(form, "flaresolverr_url");
  const api = s(form, "scraper_api_url");
  if (fsUrl && !/^https?:\/\//.test(fsUrl)) redirect("/settings?tab=admin&error=FlareSolverr+URL+should+start+with+http");
  if (api && !api.includes("{url}")) redirect("/settings?tab=admin&error=Put+{url}+where+the+page+address+goes");
  setSetting("flaresolverr_url", fsUrl);
  setSetting("scraper_api_url", api);
  redirect("/settings?tab=admin&ok=Store+lookup+settings+saved");
}

export async function adminUser(form: FormData) {
  const admin = await requireAdmin();
  const uid = n(form, "user_id");
  if (uid === admin.id) redirect("/settings?tab=admin&error=You+can't+change+your+own+admin+account+here");
  const action = s(form, "action");
  if (action === "delete") run("DELETE FROM users WHERE id = ?", uid);
  if (action === "toggle-admin") run("UPDATE users SET is_admin = 1 - is_admin WHERE id = ?", uid);
  if (action === "sso-link") {
    const r = adminLinkSso(uid, s(form, "sso_email"));
    redirect(`/settings?tab=admin&${r.ok ? "ok=" + encodeURIComponent("They'll be linked the next time they sign in with it") : "error=" + encodeURIComponent(r.error)}#people`);
  }
  if (action === "sso-unlink") adminUnlinkSso(uid);
  if (action === "reset-2fa") run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", uid);
  if (action === "reset-link") {
    const token = createReset(uid, ADMIN_RESET_HOURS);
    redirect(`/settings?tab=admin&reset_user=${uid}&reset_token=${encodeURIComponent(token)}#people`);
  }
  redirect("/settings?tab=admin&ok=Done");
}

export async function saveMailSettings(form: FormData) {
  await requireAdmin();
  const url = s(form, "smtp_url");
  const from = s(form, "smtp_from");
  const site = s(form, "site_url").replace(/\/$/, "");
  if (url && !/^smtps?:\/\//.test(url)) redirect("/settings?tab=admin&error=" + encodeURIComponent("The SMTP address should start with smtp:// or smtps://") + "#email");
  if (site && !/^https?:\/\//.test(site)) redirect("/settings?tab=admin&error=" + encodeURIComponent("The site address should start with http:// or https://") + "#email");
  if (url || form.get("clear_smtp")) setSetting("smtp_url", form.get("clear_smtp") ? "" : url);
  setSetting("smtp_from", from);
  setSetting("site_url", site);
  redirect("/settings?tab=admin&ok=Email+settings+saved#email");
}

export async function sendTestEmail() {
  const admin = await requireAdmin();
  try {
    await sendMail(admin.email, "Wishes: test email", { text: `It works! Wishes can send email from ${mailFrom()}.` });
  } catch (e) {
    redirect("/settings?tab=admin&error=" + encodeURIComponent(`Couldn't send: ${(e as Error).message}`) + "#email");
  }
  redirect("/settings?tab=admin&ok=" + encodeURIComponent(`Sent a test email to ${admin.email}`) + "#email");
}

export async function saveRegion(form: FormData) {
  await requireAdmin();
  const currency = s(form, "currency").toUpperCase();
  const locale = s(form, "locale");
  if (!CURRENCIES.some((c) => c.id === currency) || !LOCALES.some((l) => l.id === locale)) redirect("/settings?tab=admin&error=Pick+from+the+lists#region");
  setSetting("currency", currency);
  setSetting("locale", locale);
  setRegion({ currency, locale });
  redirect("/settings?tab=admin&ok=" + encodeURIComponent("Money and dates updated") + "#region");
}

export async function saveOidcSettings(form: FormData) {
  await requireAdmin();
  const back = (q: string) => redirect(`/settings?tab=admin&${q}#sso`);
  const issuer = s(form, "issuer").replace(/\/+$/, "");
  const clientId = s(form, "client_id");
  if (issuer && !/^https?:\/\//.test(issuer)) back("error=" + encodeURIComponent("The issuer URL should start with https://"));
  if (issuer && !clientId) back("error=" + encodeURIComponent("Add the client ID from your provider"));
  setSetting("oidc_name", s(form, "name").slice(0, 40) || "Single sign-on");
  setSetting("oidc_issuer", issuer);
  setSetting("oidc_client_id", clientId);
  if (s(form, "client_secret")) setSetting("oidc_client_secret", s(form, "client_secret"));
  if (form.get("clear_secret")) setSetting("oidc_client_secret", "");
  // openid, profile and email are always asked for; keep only the extras.
  setSetting("oidc_scopes", joinScopes(s(form, "scopes")).split(" ").slice(3).join(" "));
  setSetting("oidc_auto_create", form.get("auto_create") ? "1" : "0");
  setSetting("oidc_show_button", form.get("show_button") ? "1" : "0");
  setSetting("oidc_skip_2fa", form.get("skip_2fa") ? "1" : "0");
  const fam = n(form, "family_id");
  setSetting("oidc_family_id", Number.isInteger(fam) && fam > 0 ? String(fam) : "");
  forgetDiscovery();
  if (!issuer) back("ok=" + encodeURIComponent("Single sign-on is off"));
  try {
    await discover({ issuer });
  } catch (e) {
    back("error=" + encodeURIComponent(`Saved, but Wishes couldn't read ${issuer}/.well-known/openid-configuration (${(e as Error).message}). Check the issuer URL.`));
  }
  back("ok=" + encodeURIComponent("Single sign-on saved and your provider answered"));
}
