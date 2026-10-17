export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function Flash({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  if (!error && !ok) return null;
  return <p className={error ? "alert" : "alert ok"} role="status">{error ?? ok}</p>;
}
