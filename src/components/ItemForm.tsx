"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { CATEGORIES } from "@/lib/categories";
import { SubmitButton } from "@/components/SubmitButton";
import { DrawPad } from "@/components/DrawPad";
import { kindInfo, WISH_KINDS } from "@/lib/kinds";

type Info = { blocked?: boolean; title?: string; price_cents?: number; image_url?: string; store: string; description?: string; category?: string };
type AutofillFn = (url: string) => Promise<{ ok: true; info: Info } | { ok: false; error: string }>;

export type ItemDefaults = {
  title?: string; url?: string; store?: string; price?: string; image_url?: string; notes?: string; priority?: number; quantity?: number;
  category?: string; variant?: string; color?: string; size?: string; kind?: string;
};

export function ItemForm({
  action, autofill, hidden, defaults = {}, submitLabel = "Add wish", autoFetch = false,
}: {
  action: (f: FormData) => void | Promise<void>;
  autofill: AutofillFn;
  hidden: Record<string, string | number>;
  defaults?: ItemDefaults;
  submitLabel?: string;
  // Look up defaults.url right away (e.g. a link shared from another app).
  autoFetch?: boolean;
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
  const [photo, setPhoto] = useState("");
  const [kind, setKind] = useState(defaults.kind ?? "product");
  const product = kind === "product";

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

  const fetched = useRef(false);
  useEffect(() => {
    if (!autoFetch || fetched.current || !defaults.url) return;
    fetched.current = true;
    const t = setTimeout(() => fetchDetails(defaults.url), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  return (
    <form action={action} className="stack">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <fieldset className="kind-pick">
        <legend className="small fw-700">What kind of wish?</legend>
        {WISH_KINDS.map((k) => (
          <label key={k.id}>
            <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
            <span>{k.icon} {k.label}</span>
          </label>
        ))}
      </fieldset>
      <label>
        {product ? <>Link (Amazon, Walmart, Target, Kohl&apos;s, anywhere)</> : "Link (optional)"}
        <div className="row nowrap">
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
      {msg && <p className="small muted m0">{msg}</p>}
      <div className="row items-start nowrap">
        {(photo || image) && <div className="item-img"><img src={photo || image} alt="" referrerPolicy="no-referrer" /></div>}
        <div className="form-grid grow">
          <label className="full">What is it?<input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={product ? "LEGO Botanical Bonsai" : kind === "fund" ? "College fund" : kind === "gift_card" ? "Bookstore gift card" : "Zoo trip with Grandma"} /></label>
          <label>{kindInfo(kind).price}<input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="29.99" /></label>
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
        <details className="full">
          <summary className="small pointer fw-700">📷 Add a photo or 🎨 draw it</summary>
          <div className="stack mt-10">
            <label>Photo (PNG, JPEG, WebP or GIF, up to 1.5 MB)
              <input
                name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => { const f = e.target.files?.[0]; setPhoto(f ? URL.createObjectURL(f) : ""); }}
              />
            </label>
            <p className="small muted m0">…or draw it:</p>
            <DrawPad />
          </div>
        </details>
        <label className="full">Notes<textarea name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything that helps someone buy the right one" /></label>
      </div>
      <SubmitButton className="btn" disabled={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
