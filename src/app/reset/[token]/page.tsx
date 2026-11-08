import Link from "next/link";
import { finishReset } from "../../actions/auth";
import { get } from "@/lib/db";
import { resetUser } from "@/lib/resets";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "New password" };

export default async function ResetPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  const uid = resetUser(token);
  const who = uid ? get<{ email: string }>("SELECT email FROM users WHERE id = ?", uid) : undefined;
  return (
    <div className="auth-wrap">
      <div className="hero">
        <div className="big" aria-hidden="true">🔑</div>
        <h1>Pick a new password</h1>
      </div>
      <div className="card stack">
        <Flash searchParams={searchParams} />
        {!who ? (
          <p className="m0">That reset link has expired or was already used. <Link href="/forgot">Ask for a new one</Link>.</p>
        ) : (
          <form action={finishReset} className="stack">
            <input type="hidden" name="token" value={token} />
            <p className="small muted m0">For {who.email}. You&apos;ll be signed out everywhere else.</p>
            <input type="email" name="username" autoComplete="username" defaultValue={who.email} hidden readOnly />
            <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
            <label>Type it again<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
            <SubmitButton className="btn block">Save new password</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
