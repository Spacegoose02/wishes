import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "../actions/auth";
import { getUser, signupAllowed, userCount } from "@/lib/auth";
import { oidcConfig } from "@/lib/oidc";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  if (await getUser()) redirect("/");
  if (userCount() === 0) redirect("/register");
  const oidc = oidcConfig();
  const passwordOn = process.env.DISABLE_PASSWORD_LOGIN !== "true";
  return (
    <div className="auth-wrap">
      <div className="hero">
        <div className="mascots"><Avatar id="raccoon" size={64} /><Avatar id="goose" size={64} /></div>
        <h1>Welcome back to Wishes</h1>
        <p className="muted">Wishlists for the whole family.</p>
      </div>
      <div className="card stack">
        <Flash searchParams={searchParams} />
        {oidc && (
          <a className="btn block" href="/auth/oidc/start">Sign in with {oidc.name}</a>
        )}
        {oidc && passwordOn && <div className="divider">or</div>}
        {passwordOn && (
          <form action={login} className="stack">
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="btn block">Sign in</button>
          </form>
        )}
        {signupAllowed() && passwordOn && (
          <p className="small muted" style={{ textAlign: "center", margin: 0 }}>
            New here? <Link href="/register">Create an account</Link>
          </p>
        )}
      </div>
    </div>
  );
}
