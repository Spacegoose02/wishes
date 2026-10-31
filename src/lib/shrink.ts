// Phone photos are often 2–5 MB, bigger than the server takes. Before upload, large photos are
// scaled down in the browser and saved as JPEG so they arrive well under the limit.

export const PHOTO_LIMIT = 1_500_000; // keep in step with MAX_UPLOAD_BYTES in uploads.ts
export const MAX_SIDE = 1600;

// The size a photo should be drawn at: longest side at most MAX_SIDE, never scaled up.
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Does this photo need shrinking before it's sent?
export function needsShrink(file: { size: number; type: string }, dims?: { width: number; height: number }): boolean {
  if (file.type === "image/gif") return false; // shrinking would freeze the animation
  return file.size > 900_000 || (!!dims && Math.max(dims.width, dims.height) > MAX_SIDE);
}

// Returns a smaller JPEG copy of the photo, the photo itself when it's already small, or an
// error message when it can't be made small enough. Browser only.
export async function shrinkPhoto(file: File): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  if (!file.type.startsWith("image/")) return { ok: false, error: "That file isn't a picture." };
  if (file.type === "image/gif") {
    return file.size <= PHOTO_LIMIT ? { ok: true, file } : { ok: false, error: "That GIF is too big (1.5 MB max). Try a photo instead." };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC and other formats the browser can't read: send as-is if it's small enough.
    return file.size <= PHOTO_LIMIT ? { ok: true, file } : { ok: false, error: "Couldn't read that picture. Try a JPEG or PNG." };
  }
  if (!needsShrink(file, bitmap)) {
    bitmap.close();
    return { ok: true, file };
  }
  for (const [max, quality] of [[MAX_SIDE, 0.85], [1200, 0.8], [900, 0.75]] as const) {
    const size = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff"; // transparent PNGs become white, not black, as JPEG
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (blob && blob.size <= PHOTO_LIMIT) {
      bitmap.close();
      return { ok: true, file: new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" }) };
    }
  }
  bitmap.close();
  return file.size <= PHOTO_LIMIT ? { ok: true, file } : { ok: false, error: "That picture is too big even after shrinking. Try another one." };
}
