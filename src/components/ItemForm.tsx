"use client";
import { useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/categories";

type Info = { blocked?: boolean; title?: string; price_cents?: number; image_url?: string; store: string; description?: string; category?: string };
type AutofillFn = (url: string) => Promise<{ ok: true; info: Info } | { ok: false; error: string }>;

export type ItemDefaults = {
  title?: string; url?: string; store?: string; price?: string; image_url?: string; notes?: string; priority?: number; quantity?: number;
  category?: string; variant?: string; color?: string; size?: string;
};

export function ItemForm({
  action, autofill, hidden, defaults = {}, submitLabel = "Add wish",
}: {
  action: (f: FormData) => void | Promise<void>;
  autofill: AutofillFn;
  hidden: Record<string, string | number>;
  defaults?: ItemDefaults;
  submitLabel?: string;
}) {
  const [url, setUrl] = useState(defaults.url ?? "");
  const [title, setTitle] = useState(defaults.title ?? "");
  const [price, setPrice] = useState(defaults.price ?? "");
  const [store, setStore] = useState(defaults.store ?? "");
  const [image, setImage] = useState(defaults.image_url ?? "");
  const [notes, setNotes] = useState(defaults.notes ?? "");
  const [category, setCategory] = useState(defaults.category ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [lastFetched, setLastFetched] = useState("");

  function fetchDetails(target = url) {
    if (!target.trim() || target === lastFetched) return;
    setLastFetched(target);
    setMsg("Looking up that link…");
    start(async () => {
      const r = await autofill(target);
      if (!r.ok) return setMsg(r.error);
      const i = r.info;
      setStore(i.store);
      if (i.blocked) {
        if (i.title && !title) setTitle(i.title);
        return setMsg(`${i.store} didn't let us read that page. Fill in the name, price, type, color and size below; the link is saved.`);
      }
      if (i.title) setTitle(i.title);
      if (i.price_cents) setPrice((i.price_cents / 100).toFixed(2));
      if (i.image_url) setImage(i.image_url);
      if (i.category && !category) setCategory(i.category);
      // Product details help shoppers (especially grandparents) pick the exact right thing.
      if (i.description) setNotes((n) => n || i.description!.replace(/\s+/g, " ").trim().slice(0, 300));
      setMsg(i.price_cents ? `Found it at ${i.store}! Add the type, color or size if it matters.` : `Got what ${i.store} would share. Add the price yourself if it's missing.`);
    });
  }

  return (
    <form action={action} className="stack">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label>
        Link (Amazon, Walmart, Target, Kohl&apos;s, anywhere)
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            name="url" type="url" inputMode="url" placeholder="Paste a product link" value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => { const t = e.clipboardData.getData("text"); setTimeout(() => fetchDetails(t), 0); }}
          />
          <button type="button" className="btn secondary" disabled={pending || !url} onClick={() => { setLastFetched(""); fetchDetails(); }}>
            {pending ? "…" : "Autofill"}
          </button>
        </div>
      </label>
      {msg && <p className="small muted" style={{ margin: 0 }}>{msg}</p>}
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        {image && <div className="item-img"><img src={image} alt="" referrerPolicy="no-referrer" /></div>}
        <div className="form-grid" style={{ flex: 1 }}>
          <label className="full">What is it?<input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="LEGO Botanical Bonsai" /></label>
          <label>Price<input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="29.99" /></label>
          <label>Store<input name="store" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Target" /></label>
        </div>
      </div>
      <div className="form-grid">
        <label>Category
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Pick one…</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </label>
        <label>Type / style<input name="variant" defaultValue={defaults.variant} placeholder="Crew neck, 64 GB, Eau de Parfum" /></label>
        <label>Color<input name="color" defaultValue={defaults.color} placeholder="Navy" /></label>
        <label>Size<input name="size" defaultValue={defaults.size} placeholder="Kids M (8), 3.4 oz" /></label>
        <label>How much do you want it?
          <select name="priority" defaultValue={defaults.priority ?? 2}>
            <option value={3}>★★★ Really, really want</option>
            <option value={2}>★★ Would love it</option>
            <option value={1}>★ Nice to have</option>
          </select>
        </label>
        <label>How many?<input name="quantity" type="number" min={1} max={99} defaultValue={defaults.quantity ?? 1} /></label>
        <label className="full">Image link<input name="image_url" value={image} onChange={(e) => setImage(e.target.value)} placeholder="Filled in automatically" /></label>
        <label className="full">Notes<textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything that helps someone buy the right one" /></label>
      </div>
      <button className="btn" disabled={pending}>{submitLabel}</button>
    </form>
  );
}
