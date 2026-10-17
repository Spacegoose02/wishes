import { all } from "@/lib/db";
import { aiConfig, PROVIDERS } from "@/lib/ai";
import { oidcConfig } from "@/lib/oidc";
import type { User } from "@/lib/types";
import { adminUser, saveAiSettings } from "@/app/actions/app";
import { Avatar } from "@/components/Avatar";

export function AdminPanel({ me }: { me: User }) {
  const ai = aiConfig();
  const oidc = oidcConfig();
  const users = all<{ id: number; name: string; email: string; avatar: string; is_admin: number; totp_enabled: number; oidc_sub: string | null }>(
    "SELECT id, name, email, avatar, is_admin, totp_enabled, oidc_sub FROM users ORDER BY created_at",
  );
  return (
    <>
      <form action={saveAiSettings} className="card stack">
        <h2>✨ AI gift ideas</h2>
        <p className="small muted" style={{ margin: 0 }}>Optional. Ideas always go to a review list first and are never added automatically.</p>
        <div className="form-grid">
          <label>Provider
            <select name="provider" defaultValue={ai.provider}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label>Model<input name="model" defaultValue={ai.model} placeholder="Leave blank for the provider default" /></label>
          <label className="full">Base URL (OpenAI, Meta and local only)<input name="base_url" defaultValue={ai.baseUrl} placeholder="http://192.168.1.10:11434/v1" /></label>
          <label className="full">API key<input name="api_key" type="password" placeholder={ai.apiKey ? "•••••••• saved (leave blank to keep)" : "Not set"} autoComplete="off" /></label>
        </div>
        <label className="inline"><input type="checkbox" name="clear_key" /> Clear saved key</label>
        <p className="tiny muted" style={{ margin: 0 }}>Defaults: Claude {PROVIDERS[1].defaultModel}, OpenAI {PROVIDERS[2].defaultModel}, Gemini {PROVIDERS[3].defaultModel}. Local works with Ollama or LM Studio&apos;s OpenAI-compatible endpoint.</p>
        <button className="btn">Save AI settings</button>
      </form>

      <section className="card stack">
        <h2>Sign-in</h2>
        <p className="small" style={{ margin: 0 }}>
          Single sign-on: {oidc ? <strong>on ({oidc.name}, {oidc.issuer})</strong> : <span className="muted">off. Set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET in the container.</span>}
        </p>
        <p className="small" style={{ margin: 0 }}>Open sign-ups: <strong>{process.env.ALLOW_SIGNUP === "false" ? "closed" : "open"}</strong> (ALLOW_SIGNUP)</p>
        <p className="small" style={{ margin: 0 }}>Proxy header sign-in: <strong>{process.env.TRUSTED_EMAIL_HEADER ? `on (${process.env.TRUSTED_EMAIL_HEADER})` : "off"}</strong> (TRUSTED_EMAIL_HEADER)</p>
      </section>

      <section className="card">
        <h2>People ({users.length})</h2>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="row" style={{ gap: 8 }}>
                      <Avatar id={u.avatar} size={30} />
                      <span>{u.name}<div className="tiny muted">{u.email}</div></span>
                      {u.is_admin ? <span className="pill accent">admin</span> : null}
                      {u.totp_enabled ? <span className="pill good">2FA</span> : null}
                      {u.oidc_sub ? <span className="pill">SSO</span> : null}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {u.id !== me.id && (
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {(["toggle-admin", "reset-2fa", "delete"] as const).map((a) => (
                          <form key={a} action={adminUser}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="action" value={a} />
                            <button className={`btn small ${a === "delete" ? "danger" : "ghost"}`}>
                              {a === "toggle-admin" ? (u.is_admin ? "Remove admin" : "Make admin") : a === "reset-2fa" ? "Reset 2FA" : "Delete"}
                            </button>
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
