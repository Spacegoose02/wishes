import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "../actions/auth";
import { getUser, signupAllowed, userCount } from "@/lib/auth";
import { oidcConfig } from "@/lib/oidc";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { Logo } from "@/components/Logo";
import { nextQuery, safeNext } from "@/lib/next";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  if (userCount() === 0) redirect("/register");
  const oidc = oidcConfig();
  const passwordOn = process.env.DISABLE_PASSWORD_LOGIN !== "true";
  return (
    <div className="auth-wrap">
      <div className="hero">
        <Logo height={160} className="hero-logo" title="Wishes raccoon holding a wish list" />
        <h1>Welcome back to Wishes</h1>
        <p className="muted">Wishlists for the whole family.</p>
      </div>
      <div className="card stack">
        <Flash searchParams={searchParams} />
        {oidc && (
          <a className="btn block" href={`/auth/oidc/start${nextQuery(next)}`}>Sign in with {oidc.name}</a>
        )}
        {oidc && passwordOn && <div className="divider">or</div>}
        {passwordOn && (
          <form action={login} className="stack">
            <input type="hidden" name="next" value={next} />
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            <SubmitButton className="btn block">Sign in</SubmitButton>
            <p className="small text-center m0"><Link href="/forgot">Forgot your password?</Link></p>
          </form>
        )}
        {signupAllowed() && passwordOn && (
          <p className="small muted text-center m0">
            New here? <Link href="/register">Create an account</Link>
          </p>
        )}
      </div>
    </div>
  );
}
