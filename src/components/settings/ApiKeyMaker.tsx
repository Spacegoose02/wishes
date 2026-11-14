"use client";
import { useActionState } from "react";
import { makeApiKey } from "@/app/actions/account";
import { SubmitButton } from "@/components/SubmitButton";
import { CopyButton } from "@/components/CopyButton";

// Makes a new API key and shows it this one time.
export function ApiKeyMaker() {
  const [state, action] = useActionState(makeApiKey, {});
  return (
    <div className="stack">
      {state.token && (
        <div className="alert ok stack m0">
          <strong>Here&apos;s the key for {state.name}. Copy it now: Wishes won&apos;t show it again.</strong>
          <div className="row nowrap">
            <input readOnly value={state.token} aria-label="New API key" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={state.token} />
          </div>
        </div>
      )}
      {state.error && <p className="alert error m0">{state.error}</p>}
      <form action={action} className="row items-end">
        <label className="grow">Name it after the app<input name="name" placeholder="Den Duty" maxLength={60} required /></label>
        <SubmitButton className="btn secondary">Make a key</SubmitButton>
      </form>
    </div>
  );
}
