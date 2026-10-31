import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomToken } from "./crypto";

// Wish photos and drawings live under DATA_DIR/uploads with long random names, so the
// URL itself is the key (guest and print views can show them without a session).

export const MAX_UPLOAD_BYTES = 1_500_000;
const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as const;
type Ext = keyof typeof TYPES;
const NAME = /^[A-Za-z0-9_-]{20,64}\.(png|jpg|webp|gif)$/;

function dir(): string {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "uploads");
}

// Trust the bytes, not the file name or the browser's claimed type.
export function sniffImage(b: Uint8Array): Ext | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "gif";
  return null;
}

export function saveImage(bytes: Uint8Array): { ok: true; url: string } | { ok: false; error: string } {
  if (!bytes.length) return { ok: false, error: "That picture was empty." };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: "That picture is too big (1.5 MB max)." };
  const ext = sniffImage(bytes);
  if (!ext) return { ok: false, error: "Pictures need to be PNG, JPEG, WebP or GIF." };
  fs.mkdirSync(dir(), { recursive: true });
  const name = `${randomToken(18).replace(/[^A-Za-z0-9_-]/g, "")}.${ext}`;
  fs.writeFileSync(path.join(dir(), name), bytes);
  return { ok: true, url: `/uploads/${name}` };
}

export function readImage(name: string): { bytes: Buffer; type: string } | null {
  if (!NAME.test(name)) return null;
  try {
    return { bytes: fs.readFileSync(path.join(dir(), name)), type: TYPES[name.split(".").pop() as Ext] };
  } catch {
    return null;
  }
}

export function isUploadUrl(url: string): boolean {
  return url.startsWith("/uploads/") && NAME.test(url.slice("/uploads/".length));
}

// A wish's picture from a form: an uploaded photo ("photo") or a canvas drawing ("drawing", a PNG data URL).
// Returns undefined when neither was given.
export async function imageFromForm(form: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string } | undefined> {
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That picture is too big (1.5 MB max)." };
    return saveImage(new Uint8Array(await photo.arrayBuffer()));
  }
  const drawing = String(form.get("drawing") ?? "");
  const m = drawing.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (m) return saveImage(new Uint8Array(Buffer.from(m[1], "base64")));
  return undefined;
}
