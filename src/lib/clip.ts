// The "Add to Wishes" bookmark: a person's own browser hands over the product page it has open,
// so stores that block servers (Kohl's and friends) still fill in the add form.

export type ClipInfo = { url: string; title?: string; price_cents?: number; image_url?: string; store?: string; category?: string; description?: string };

const FIELDS = { name: 200, price: 12, image: 1000, store: 60, cat: 40, notes: 300 } as const;

// Search params carried from /clip through /share to the list's add form.
export function clipParams(info: ClipInfo): URLSearchParams {
  const p = new URLSearchParams({ url: info.url, clip: "1" });
  const put = (k: keyof typeof FIELDS, v: string | undefined) => {
    const t = v?.replace(/\s+/g, " ").trim().slice(0, FIELDS[k]);
    if (t) p.set(k, t);
  };
  put("name", info.title);
  put("price", info.price_cents ? (info.price_cents / 100).toFixed(2) : undefined);
  put("image", info.image_url && /^https?:\/\//i.test(info.image_url) ? info.image_url : undefined);
  put("store", info.store);
  put("cat", info.category);
  put("notes", info.description);
  return p;
}

type SP = Record<string, string | string[] | undefined>;

// Only the clip fields, ready to forward onto the list page's address.
export function forwardClip(sp: SP): string {
  if (sp.clip !== "1") return "";
  const p = new URLSearchParams({ clip: "1" });
  for (const k of Object.keys(FIELDS)) {
    const v = sp[k];
    if (typeof v === "string" && v) p.set(k, v.slice(0, FIELDS[k as keyof typeof FIELDS]));
  }
  return `&${p}`;
}

export function clipDefaults(sp: SP): { title?: string; price?: string; image_url?: string; store?: string; category?: string; notes?: string } | null {
  if (sp.clip !== "1") return null;
  const str = (k: keyof typeof FIELDS) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, FIELDS[k]) : undefined) || undefined;
  const image = str("image");
  const price = str("price");
  return {
    title: str("name"),
    price: price && /^\d+(\.\d{1,2})?$/.test(price) ? price : undefined,
    image_url: image && /^https?:\/\//i.test(image) ? image : undefined,
    store: str("store"),
    category: str("cat"),
    notes: str("notes"),
  };
}

// The bookmark itself. It opens Wishes in a new tab and, once that tab says it's ready,
// posts the page to it. postMessage only reaches the Wishes address, and window.open
// isn't stopped by the strict content rules many stores set for forms and fetches.
export function bookmarkletCode(origin: string): string {
  const o = JSON.stringify(origin.replace(/\/$/, ""));
  const js =
    `(()=>{const o=${o},w=window.open(o+"/clip","_blank");` +
    `if(!w){alert("Let this page open pop-ups, then try again.");return}` +
    `const h=e=>{if(e.origin!==o||e.source!==w||e.data!=="wishes-clip-ready")return;removeEventListener("message",h);` +
    `w.postMessage({type:"wishes-clip",url:location.href,html:document.documentElement.outerHTML.slice(0,4e6)},o)};` +
    `addEventListener("message",h)})()`;
  return `javascript:${encodeURIComponent(js)}`;
}
