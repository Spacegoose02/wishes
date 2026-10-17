"use client";
import { useState, useTransition } from "react";

type Info = { blocked?: boolean; title?: string; price_cents?: number; image_url?: string; store: string; description?: string };
type AutofillFn = (url: string) => Promise<{ ok: true; info: Info } | { ok: false; error: string }>;

export type ItemDefaults = {
  title?: string; url?: string; store?: string; price?: string; image_url?: string; notes?: string; priority?: number; quantity?: number;
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
      if (i.title) setTitle(i.title);
      if (i.price_cents) setPrice((i.price_cents / 100).toFixed(2));
      if (i.image_url) setImage(i.image_url);
      // Product details help shoppers (especially grandparents) pick the exact right thing.
      if (i.description) setNotes((n) => n || i.description!.replace(/\s+/g, " ").trim().slice(0, 300));
      setStore(i.store);
      if (i.blocked) return setMsg(`${i.store} didn't let us peek at that page. Fill in the name and price yourself; the link is saved.`);
      setMsg(i.price_cents ? `Found it at ${i.store}!` : `Got what ${i.store} would share. Add the price yourself if it's missing.`);
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
        <label>How much do you want it?
          <select name="priority" defaultValue={defaults.priority ?? 2}>
            <option value={3}>★★★ Really, really want</option>
            <option value={2}>★★ Would love it</option>
            <option value={1}>★ Nice to have</option>
          </select>
        </label>
        <label>How many?<input name="quantity" type="number" min={1} max={99} defaultValue={defaults.quantity ?? 1} /></label>
        <label className="full">Image link<input name="image_url" value={image} onChange={(e) => setImage(e.target.value)} placeholder="Filled in automatically" /></label>
        <label className="full">Notes (size, color, version…)<textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      <button className="btn" disabled={pending}>{submitLabel}</button>
    </form>
  );
}
