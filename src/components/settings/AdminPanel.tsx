import { all } from "@/lib/db";
import { aiConfig, CLAUDE_MODELS, PROVIDERS } from "@/lib/ai";
import { webSearchEnabled } from "@/lib/bandit";
import { dailyCap, monthUsage } from "@/lib/chatstore";
import { oidcConfig } from "@/lib/oidc";
import type { User } from "@/lib/types";
import { adminUser, saveAiSettings, saveScrapeSettings } from "@/app/actions/admin";
import { getSetting } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/SubmitButton";

export function AdminPanel({ me }: { me: User }) {
  const ai = aiConfig();
  const oidc = oidcConfig();
  const usage = monthUsage();
  const money = (usd: number) => (usd < 0.01 && usd > 0 ? "under 1¢" : `$${usd.toFixed(2)}`);
  const users = all<{ id: number; name: string; email: string; avatar: string; is_admin: number; totp_enabled: number; oidc_sub: string | null }>(
    "SELECT id, name, email, avatar, is_admin, totp_enabled, oidc_sub FROM users ORDER BY created_at",
  );
  return (
    <>
      <form action={saveAiSettings} className="card stack">
        <h2>✨ AI gift ideas</h2>
        <p className="small muted m0">Optional. Ideas always go to a review list first and are never added automatically.</p>
        <div className="form-grid">
          <label>Provider
            <select name="provider" defaultValue={ai.provider}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label>Model<input name="model" list="claude-models" defaultValue={ai.model} placeholder="Leave blank for the provider default" /></label>
          <datalist id="claude-models">
            {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </datalist>
          <label className="full">Base URL (OpenAI, Meta and local only)<input name="base_url" defaultValue={ai.baseUrl} placeholder="http://192.168.1.10:11434/v1" /></label>
          <label className="full">API key<input name="api_key" type="password" placeholder={ai.apiKey ? "•••••••• saved (leave blank to keep)" : "Not set"} autoComplete="off" /></label>
        </div>
        <label className="inline"><input type="checkbox" name="clear_key" /> Clear saved key</label>
        <p className="tiny muted m0">Defaults: Claude {PROVIDERS[1].defaultModel}, OpenAI {PROVIDERS[2].defaultModel}, Gemini {PROVIDERS[3].defaultModel}. Local works with Ollama or LM Studio&apos;s OpenAI-compatible endpoint.</p>
        <h3 className="m0 mt-12">🦝 Bandit chat</h3>
        <label className="inline">
          <input type="checkbox" name="web_search" defaultChecked={webSearchEnabled()} /> Let Bandit search the web for current products and prices (Claude only, about 1¢ per search)
        </label>
        <label>Messages per person per day (0 for no limit)
          <input name="chat_daily_cap" type="number" min={0} max={10000} defaultValue={dailyCap()} />
        </label>
        <p className="small m0">
          This month: <strong>{usage.replies}</strong> {usage.replies === 1 ? "reply" : "replies"}, about <strong>{money(usage.cost)}</strong>
          {usage.replies > 0 && <> ({Math.round(usage.cacheShare * 100)}% of input served from cache)</>}
          {usage.byModel.length > 1 && <span className="muted"> · {usage.byModel.map((m) => `${m.model}: ${m.replies} for ${money(m.cost)}`).join(" · ")}</span>}
        </p>
        <p className="tiny muted m0">Estimated from list prices, for Claude replies only. Your Anthropic console has the exact bill.</p>
        <SubmitButton className="btn">Save AI settings</SubmitButton>
      </form>

      <form action={saveScrapeSettings} className="card stack">
        <h2>🧩 Store lookups behind bot walls</h2>
        <p className="small muted m0">
          Some stores show a &quot;checking your browser&quot; page instead of the product. If you run a FlareSolverr container, Wishes can send those pages through it. A scraping service URL works as a second option.
        </p>
        <label>FlareSolverr URL<input name="flaresolverr_url" defaultValue={getSetting("flaresolverr_url") ?? process.env.FLARESOLVERR_URL ?? ""} placeholder="http://192.168.1.10:8191" /></label>
        <label>Scraping service URL (use {"{url}"} for the page)<input name="scraper_api_url" defaultValue={getSetting("scraper_api_url") ?? process.env.SCRAPER_API_URL ?? ""} placeholder="https://api.example.com/?key=KEY&url={url}" /></label>
        <SubmitButton className="btn">Save</SubmitButton>
      </form>

      <section className="card stack">
        <h2>Sign-in</h2>
        <p className="small m0">
          Single sign-on: {oidc ? <strong>on ({oidc.name}, {oidc.issuer})</strong> : <span className="muted">off. Set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET in the container.</span>}
        </p>
        <p className="small m0">Open sign-ups: <strong>{process.env.ALLOW_SIGNUP === "false" ? "closed" : "open"}</strong> (ALLOW_SIGNUP)</p>
        <p className="small m0">Proxy header sign-in: <strong>{process.env.TRUSTED_EMAIL_HEADER ? `on (${process.env.TRUSTED_EMAIL_HEADER})` : "off"}</strong> (TRUSTED_EMAIL_HEADER)</p>
      </section>

      <section className="card">
        <h2>People ({users.length})</h2>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="row gap-8">
                      <Avatar id={u.avatar} size={30} />
                      <span>{u.name}<div className="tiny muted">{u.email}</div></span>
                      {u.is_admin ? <span className="pill accent">admin</span> : null}
                      {u.totp_enabled ? <span className="pill good">2FA</span> : null}
                      {u.oidc_sub ? <span className="pill">SSO</span> : null}
                    </span>
                  </td>
                  <td className="text-right">
                    {u.id !== me.id && (
                      <div className="row justify-end gap-6">
                        {(["toggle-admin", "reset-2fa", "delete"] as const).map((a) => (
                          <form key={a} action={adminUser}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="action" value={a} />
                            <SubmitButton className={`btn small ${a === "delete" ? "danger" : "ghost"}`} confirm={a === "delete" ? `Delete ${u.name}?` : a === "reset-2fa" ? "Reset their 2FA?" : undefined}>
                              {a === "toggle-admin" ? (u.is_admin ? "Remove admin" : "Make admin") : a === "reset-2fa" ? "Reset 2FA" : "Delete"}
                            </SubmitButton>
                          </form>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
