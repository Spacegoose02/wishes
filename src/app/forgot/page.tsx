import Link from "next/link";
import { redirect } from "next/navigation";
import { requestReset } from "../actions/auth";
import { getUser } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Forgot password" };

export default async function ForgotPage({ searchParams }: { searchParams: SP }) {
  if (await getUser()) redirect("/settings?tab=security");
  const sent = (await searchParams).sent === "1";
  return (
    <div className="auth-wrap">
      <div className="hero">
        <div className="big" aria-hidden="true">🔑</div>
        <h1>Forgot your password?</h1>
      </div>
      <div className="card stack">
        <Flash searchParams={searchParams} />
        {!mailEnabled() ? (
          <p className="m0">This Wishes server can&apos;t send email yet, so ask whoever runs it for a reset link. They can make one in Settings, Server, next to your name.</p>
        ) : sent ? (
          <p className="m0">If that email has a Wishes account, a reset link is on its way. It works for an hour. Check your spam folder if it doesn&apos;t show up.</p>
        ) : (
          <form action={requestReset} className="stack">
            <label>Your email<input name="email" type="email" autoComplete="email" required /></label>
            <SubmitButton className="btn block" pendingLabel="Sending…">Email me a reset link</SubmitButton>
          </form>
        )}
        <p className="small muted text-center m0"><Link href="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}
