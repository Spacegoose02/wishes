"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { all, get, run } from "@/lib/db";
import { storeSearch } from "@/lib/scrape/stores";
import { bestMatches, searchStores } from "@/lib/scrape/search";
import { guessCategory, validCategory } from "@/lib/categories";
import { describeProfile, profileAge } from "@/lib/profile";
import { generateIdeas } from "@/lib/ai";
import type { Profile } from "@/lib/types";
import { s, n, ownList, isSearchLink } from "./_shared";

export async function requestSuggestions(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id)!;
  const existing = all<{ title: string }>("SELECT title FROM items WHERE list_id = ?", list.id).map((r) => r.title);
  try {
    const { ideas, source } = await generateIdeas({
      listTitle: list.title,
      occasion: list.occasion,
      forName: profile.name,
      age: profileAge(profile),
      about: describeProfile(profile),
      existing,
      hint: s(form, "hint"),
    });
    // Turn each idea into a real listing when a store search finds it; otherwise keep a search link.
    const resolved = await Promise.all(ideas.map(async (i) => {
      const query = i.search || i.title;
      const prefer = /walmart/i.test(i.store ?? "") ? ["Walmart", "Amazon"] as const : ["Amazon", "Walmart"] as const;
      const found = await searchStores(query, [...prefer]).catch(() => []);
      const hit = bestMatches(i.title, found, 0.5)[0] ?? bestMatches(query, found, 0.6)[0];
      return { i, hit };
    }));
    for (const { i, hit } of resolved) {
      const fallback = storeSearch(i.store, i.search || i.title);
      run(
        "INSERT INTO suggestions (list_id, title, reason, est_price_cents, source, store, category, url, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        list.id, hit?.title.slice(0, 200) ?? i.title, i.reason,
        hit?.price_cents ?? (i.est_price ? Math.round(i.est_price * 100) : null), source,
        hit?.store ?? fallback.store, validCategory(i.category ?? "") || guessCategory(i.title), hit?.url ?? fallback.url, hit?.image_url ?? "",
      );
    }
  } catch (e) {
    redirect(`/lists/${list.id}/ideas?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/lists/${list.id}/ideas`);
}

export async function reviewSuggestion(form: FormData) {
  const sug = get<{ id: number; list_id: number; title: string; reason: string; est_price_cents: number | null; url: string; store: string; category: string; image_url: string }>(
    "SELECT * FROM suggestions WHERE id = ? AND status = 'pending'", n(form, "suggestion_id"),
  );
  if (!sug) redirect("/");
  const { list } = await ownList(sug.list_id);
  if (s(form, "decision") === "accept") {
    run(
      "INSERT INTO items (list_id, title, notes, price_cents, url, store, category, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      list.id, sug.title, sug.reason, sug.est_price_cents, isSearchLink(sug.url) ? "" : sug.url, sug.store, sug.category, sug.image_url,
    );
    run("UPDATE suggestions SET status = 'accepted' WHERE id = ?", sug.id);
  } else {
    run("UPDATE suggestions SET status = 'rejected' WHERE id = ?", sug.id);
  }
  revalidatePath(`/lists/${list.id}/ideas`);
}
