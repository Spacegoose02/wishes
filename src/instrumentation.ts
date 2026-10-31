// Background jobs, swept hourly: yearly lists rolling forward, and periodic price checks
// for deal alerts (off when PRICE_CHECK_HOURS=0).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const hours = Number(process.env.PRICE_CHECK_HOURS ?? 24);
  const { refreshPrices } = await import("./lib/prices");
  const { rollYearlyLists } = await import("./lib/lists");
  const job = (name: string, fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      console.error(`${name} failed`, e);
    }
  };
  const tick = () => {
    job("yearly list roll", rollYearlyLists);
    if (hours) refreshPrices().catch((e) => console.error("price refresh failed", e));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 60 * 60_000); // each item is re-checked every PRICE_CHECK_HOURS
}
