import { all } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { categoryIcon } from "@/lib/categories";
import { kindInfo } from "@/lib/kinds";
import type { Item } from "@/lib/types";

// A plain, spoiler-free rundown of a list's wishes: no claims, pledges or purchases,
// so it's fine on paper, on the fridge or behind a QR code.
export function ListSheet({ listId }: { listId: number }) {
  const items = all<Item>(
    "SELECT * FROM items WHERE list_id = ? AND needs_approval = 0 AND archived_at IS NULL ORDER BY must_have DESC, priority DESC, created_at DESC",
    listId,
  );
  if (!items.length) return <p className="muted">No wishes yet.</p>;
  return (
    <ul className="print-items">
      {items.map((it) => {
        const details = [it.kind !== "product" && kindInfo(it.kind).label, it.variant, it.color && `Color: ${it.color}`, it.size && `Size: ${it.size}`, it.quantity > 1 && `×${it.quantity}`].filter(Boolean);
        return (
          <li key={it.id}>
            {it.image_url ? <img src={it.image_url} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{categoryIcon(it.category)}</span>}
            <div className="grow min-0">
              <strong>{it.must_have ? "⭐ " : ""}{it.title}</strong> {"★".repeat(it.priority)}
              <div className="small">
                {[it.price_cents ? formatMoney(it.price_cents, it.currency) : "", it.store, ...details].filter(Boolean).join(" · ")}
              </div>
              {it.notes && <div className="small">{it.notes}</div>}
              {it.url && <a className="tiny" href={it.url} target="_blank" rel="noopener noreferrer nofollow">{it.url.length > 70 ? it.url.slice(0, 67) + "…" : it.url}</a>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
