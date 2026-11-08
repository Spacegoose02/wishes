import { getUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { isRecipient, myLists, myProfiles } from "@/lib/access";
import { toCsv } from "@/lib/importer";
import type { Item } from "@/lib/types";

// Download every list you manage, as a spreadsheet (CSV) or as JSON. Only wishes and list
// details: no claims or purchases, and surprises stay hidden from the person they're for.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
  const lists = myLists(user.id).map((l) => {
    const items = all<Item>("SELECT * FROM items WHERE list_id = ? AND needs_approval = 0 ORDER BY archived_at IS NOT NULL, priority DESC, created_at", l.id)
      .filter((i) => !i.surprise || !isRecipient(user.id, l));
    return { list: l, items };
  });
  const day = new Date().toISOString().slice(0, 10);
  const headers = (type: string, ext: string) => ({
    "content-type": type,
    "content-disposition": `attachment; filename="wishes-${day}.${ext}"`,
    "cache-control": "no-store",
  });
  if (format === "json") {
    const data = {
      exported_at: new Date().toISOString(),
      app: "Wishes",
      profiles: myProfiles(user.id).map((p) => ({ name: p.name, birthday: p.birthday, likes: p.likes, dislikes: p.dislikes, sizes: JSON.parse(p.sizes || "{}"), notes: p.gift_notes })),
      lists: lists.map(({ list: l, items }) => ({
        title: l.title, for: l.profile_name, emoji: l.emoji, occasion: l.occasion, date: l.event_date, description: l.description,
        wishes: items.map((i) => ({
          title: i.title, url: i.url, store: i.store, price: i.price_cents === null ? null : i.price_cents / 100, currency: i.currency,
          image: i.image_url.startsWith("/uploads/") ? "" : i.image_url, notes: i.notes, priority: i.priority, quantity: i.quantity,
          category: i.category, color: i.color, size: i.size, variant: i.variant, kind: i.kind, must_have: !!i.must_have,
          status: i.archived_at ? (i.archive_reason === "unwanted" ? "not wanted" : "got it") : "wanted",
        })),
      })),
    };
    return new Response(JSON.stringify(data, null, 2), { headers: headers("application/json; charset=utf-8", "json") });
  }
  const rows = lists.flatMap(({ list: l, items }) => items.map((i) => ({
    list: l.title, for: l.profile_name, title: i.title, url: i.url, store: i.store,
    price: i.price_cents === null ? "" : (i.price_cents / 100).toFixed(2), notes: i.notes, priority: i.priority, quantity: i.quantity,
    category: i.category, color: i.color, size: i.size, variant: i.variant, must_have: i.must_have ? "yes" : "",
    status: i.archived_at ? (i.archive_reason === "unwanted" ? "not wanted" : "got it") : "wanted",
  })));
  return new Response("﻿" + toCsv(rows), { headers: headers("text/csv; charset=utf-8", "csv") });
}
