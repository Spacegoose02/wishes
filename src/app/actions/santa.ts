"use server";
import { redirect } from "next/navigation";
import { run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseMoney } from "@/lib/format";
import { notify } from "@/lib/prices";
import { getExchange, participants, runDraw, setParticipants } from "@/lib/santa";
import { s, n, familyAdmin } from "./_shared";

async function adminOf(exchangeId: number) {
  const ex = getExchange(exchangeId);
  if (!ex) redirect("/santa?error=Exchange+not+found");
  const user = await familyAdmin(ex.family_id);
  return { user, ex };
}

export async function createExchange(form: FormData) {
  const fid = n(form, "family_id");
  const user = await familyAdmin(fid);
  const name = s(form, "name").slice(0, 80) || "Secret Santa";
  const r = run(
    "INSERT INTO exchanges (family_id, name, budget_cents, exchange_date, created_by) VALUES (?, ?, ?, ?, ?)",
    fid, name, parseMoney(form.get("budget")), s(form, "exchange_date") || null, user.id,
  );
  redirect(`/santa/${r.lastInsertRowid}?ok=Pick+who%27s+in`);
}

export async function saveExchange(form: FormData) {
  const { ex } = await adminOf(n(form, "exchange_id"));
  run(
    "UPDATE exchanges SET name = ?, budget_cents = ?, exchange_date = ? WHERE id = ?",
    s(form, "name").slice(0, 80) || ex.name, parseMoney(form.get("budget")), s(form, "exchange_date") || null, ex.id,
  );
  const people = form.getAll("people").map(Number).map((id) => ({ id, household: s(form, `household_${id}`) }));
  const before = participants(ex.id).map((p) => `${p.user_id}:${p.household}`).sort().join();
  const after = people.map((p) => `${p.id}:${p.household}`).sort().join();
  // Only touch the people (which resets a draw) when they actually changed.
  if (before !== after) setParticipants(ex.id, people);
  redirect(`/santa/${ex.id}?ok=Saved`);
}

export async function drawExchange(form: FormData) {
  const { user, ex } = await adminOf(n(form, "exchange_id"));
  const r = runDraw(ex.id);
  if (!r.ok) redirect(`/santa/${ex.id}?error=${encodeURIComponent(r.error)}`);
  for (const p of participants(ex.id)) {
    if (p.user_id !== user.id) notify(p.user_id, "santa", `Names are drawn for ${ex.name}! See who you're giving to.`, `/santa/${ex.id}`);
  }
  redirect(`/santa/${ex.id}?ok=${encodeURIComponent("Names drawn! Everyone can see their own match now.")}`);
}

export async function deleteExchange(form: FormData) {
  const { ex } = await adminOf(n(form, "exchange_id"));
  run("DELETE FROM exchanges WHERE id = ?", ex.id);
  redirect("/santa?ok=Exchange+deleted");
}

// A participant ticks off that their gift is sorted.
export async function markSantaDone(form: FormData) {
  const user = await requireUser();
  const ex = getExchange(n(form, "exchange_id"));
  if (!ex) redirect("/santa");
  const done = s(form, "done") === "1" ? 1 : 0;
  run("UPDATE exchange_people SET done = ? WHERE exchange_id = ? AND user_id = ?", done, ex.id, user.id);
  redirect(`/santa/${ex.id}?ok=${done ? "Nice+work%2C+Santa!" : "Marked+not+done"}`);
}
