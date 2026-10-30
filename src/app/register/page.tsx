import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "../actions/auth";
import { getUser, signupAllowed, userCount } from "@/lib/auth";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: SP }) {
  if (await getUser()) redirect("/");
  if (!signupAllowed()) redirect("/login?error=Sign-ups+are+closed");
  const first = userCount() === 0;
  return (
    <div className="auth-wrap">
      <div className="hero">
        <h1>{first ? "Set up Wishes" : "Join Wishes"}</h1>
        <p className="muted">{first ? "You'll be the admin of this server." : "Make lists, share with family, keep surprises secret."}</p>
      </div>
      <form action={register} className="card stack">
        <Flash searchParams={searchParams} />
        <label>Your name<input name="name" autoComplete="name" required /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
        <div>
          <p className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Pick your critter</p>
          <AvatarPicker />
        </div>
        <SubmitButton className="btn block">Create account</SubmitButton>
        {!first && <p className="small muted" style={{ textAlign: "center", margin: 0 }}>Have an account? <Link href="/login">Sign in</Link></p>}
      </form>
    </div>
  );
}
