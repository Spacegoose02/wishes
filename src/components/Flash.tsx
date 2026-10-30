import { Toast } from "./Toast";

export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function Flash({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  if (!error && !ok) return null;
  // A fresh key per request, so the same message shows again after the next action.
  return <Toast key={crypto.randomUUID()} kind={error ? "error" : "ok"} message={(error ?? ok)!} />;
}
