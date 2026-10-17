import QRCode from "qrcode";
import { totpUri } from "@/lib/crypto";
import type { User } from "@/lib/types";
import { changePassword, confirmTotp, disableTotp, startTotp } from "@/app/actions/auth";

export async function SecurityPanel({ user }: { user: User }) {
  const settingUp = !!user.totp_secret && !user.totp_enabled;
  const qr = settingUp ? await QRCode.toDataURL(totpUri(user.totp_secret!, user.email), { margin: 1, width: 220 }) : null;
  return (
    <>
      <section className="card stack">
        <h2>Two-factor sign-in</h2>
        {user.totp_enabled ? (
          <>
            <p className="alert ok" style={{ margin: 0 }}>On. You&apos;ll be asked for a code from your authenticator app when you sign in.</p>
            <form action={disableTotp} className="row" style={{ alignItems: "flex-end" }}>
              <label style={{ flex: 1 }}>Current code<input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
              <button className="btn danger">Turn off</button>
            </form>
          </>
        ) : settingUp ? (
          <>
            <p className="small">Scan this with an authenticator app (Google Authenticator, 1Password, Aegis, Bitwarden…), then type the 6-digit code.</p>
            <div className="row" style={{ alignItems: "flex-start" }}>
              {qr && <img src={qr} alt="Two-factor QR code" width={180} height={180} style={{ borderRadius: 12, background: "#fff", padding: 6 }} />}
              <div className="stack" style={{ flex: 1, minWidth: 200 }}>
                <span className="small muted">Or enter this key:</span>
                <span className="code">{user.totp_secret}</span>
                <form action={confirmTotp} className="stack">
                  <label>Code<input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
                  <button className="btn">Turn on</button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="small muted" style={{ margin: 0 }}>Add a second step to your sign-in with an authenticator app.</p>
            <form action={startTotp}><button className="btn">Set up two-factor</button></form>
          </>
        )}
      </section>

      <form action={changePassword} className="card stack">
        <h2>{user.password_hash ? "Change password" : "Set a password"}</h2>
        {user.password_hash && <label>Current password<input name="current" type="password" autoComplete="current-password" required /></label>}
        <label>New password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
        <button className="btn">Save password</button>
      </form>
    </>
  );
}
