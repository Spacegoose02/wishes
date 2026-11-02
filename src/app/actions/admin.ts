"use server";
import { redirect } from "next/navigation";
import { run, setSetting } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PROVIDERS, type AiProvider } from "@/lib/ai";
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
  if (action === "reset-2fa") run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", uid);
  redirect("/settings?tab=admin&ok=Done");
}
