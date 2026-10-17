// Background jobs: periodic price checks for deal alerts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const hours = Number(process.env.PRICE_CHECK_HOURS ?? 24);
  if (!hours || process.env.NODE_ENV !== "production") return;
  const { refreshPrices } = await import("./lib/prices");
  const tick = () => refreshPrices().catch((e) => console.error("price refresh failed", e));
  setTimeout(tick, 60_000);
  setInterval(tick, 60 * 60_000); // hourly sweep; each item is re-checked every PRICE_CHECK_HOURS
}
