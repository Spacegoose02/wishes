// Pasting a picture (Ctrl+V / Cmd+V) into the add-wish form. This is the plain part (which
// picture was pasted, and which form should take it) so it can be tested without a browser.

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type ClipboardLike = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null;
};

// The picture on the clipboard, if there is one we can use. Some browsers only list it under
// items, so both are checked.
export function pastedImage(data: ClipboardLike | null | undefined): File | null {
  if (!data) return null;
  for (const f of Array.from(data.files ?? [])) if (IMAGE_TYPES.includes(f.type)) return f;
  for (const it of Array.from(data.items ?? [])) {
    if (it.kind !== "file" || !IMAGE_TYPES.includes(it.type)) continue;
    const f = it.getAsFile();
    if (f) return f;
  }
  return null;
}

type TargetLike = { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined;

const TEXTLESS_INPUTS = ["checkbox", "radio", "file", "button", "submit", "reset", "range", "color", "hidden", "image"];

// Is the paste going into a box you type in? Then copied text should land there as normal.
export function isTextEntry(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  return tag === "INPUT" && !TEXTLESS_INPUTS.includes((target.type ?? "text").toLowerCase());
}

// Which add-wish form on the page takes a pasted picture: the one you're typing in, otherwise the
// first one that's open on screen. Null when the paste is going into some other box on the page.
export function formForPaste<F>(forms: { form: F; contains: boolean; visible: boolean }[], targetIsTextEntry: boolean): F | null {
  const inside = forms.find((f) => f.contains);
  if (inside) return inside.form;
  if (targetIsTextEntry) return null;
  return forms.find((f) => f.visible)?.form ?? null;
}
