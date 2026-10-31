import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Uploads from "@/lib/uploads";

let up: typeof Uploads;

beforeAll(async () => {
  await testDb(); // sets a throwaway DATA_DIR
  up = await import("@/lib/uploads");
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("uploads", () => {
  it("recognizes image types by their bytes", () => {
    expect(up.sniffImage(PNG)).toBe("png");
    expect(up.sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(up.sniffImage(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBe("webp");
    expect(up.sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("saves, serves back and refuses bad files", () => {
    const r = up.saveImage(PNG);
    expect(r.ok).toBe(true);
    const url = (r as { url: string }).url;
    expect(up.isUploadUrl(url)).toBe(true);
    expect(up.readImage(url.slice("/uploads/".length))).toMatchObject({ type: "image/png" });
    expect(up.readImage("../wishes.db")).toBeNull();
    expect(up.saveImage(new Uint8Array(up.MAX_UPLOAD_BYTES + 1)).ok).toBe(false);
    expect(up.saveImage(new TextEncoder().encode("hello")).ok).toBe(false);
  });

  it("reads a photo or a drawing from a form", async () => {
    const f = new FormData();
    expect(await up.imageFromForm(f)).toBeUndefined();
    f.set("drawing", `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
    expect(await up.imageFromForm(f)).toMatchObject({ ok: true });
    const g = new FormData();
    g.set("photo", new File([new TextEncoder().encode("not an image")], "x.png", { type: "image/png" }));
    expect(await up.imageFromForm(g)).toMatchObject({ ok: false });
  });
});
