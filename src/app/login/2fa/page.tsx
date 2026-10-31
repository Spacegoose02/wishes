import { redirect } from "next/navigation";
import { logout, verify2fa } from "../../actions/auth";
import { getPending2faUser } from "@/lib/auth";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { safeNext } from "@/lib/next";

export const metadata = { title: "Two-factor sign-in" };

export default async function TwoFactorPage({ searchParams }: { searchParams: SP }) {
  const user = await getPending2faUser();
  if (!user) redirect("/login");
  return (
    <div className="auth-wrap">
      <div className="hero"><h1>One more step</h1><p className="muted">Enter the 6-digit code from your authenticator app.</p></div>
      <div className="card stack">
        <Flash searchParams={searchParams} />
        <form action={verify2fa} className="stack">
          <input type="hidden" name="next" value={safeNext((await searchParams).next)} />
          <label>Code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" autoFocus required /></label>
          <SubmitButton className="btn block">Verify</SubmitButton>
        </form>
        <form action={logout}><SubmitButton className="btn ghost block">Cancel</SubmitButton></form>
      </div>
    </div>
  );
}
