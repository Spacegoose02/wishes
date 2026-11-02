import { describe, expect, it } from "vitest";
import { fitWithin, MAX_SIDE, needsShrink, PHOTO_LIMIT } from "@/lib/shrink";

describe("photo shrinking", () => {
  it("scales the longest side down to the limit and keeps the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_SIDE, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: MAX_SIDE });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("shrinks big or huge photos, but never GIFs", () => {
    expect(needsShrink({ size: 3_000_000, type: "image/jpeg" })).toBe(true);
    expect(needsShrink({ size: 200_000, type: "image/jpeg" }, { width: 4000, height: 3000 })).toBe(true);
    expect(needsShrink({ size: 200_000, type: "image/png" }, { width: 800, height: 600 })).toBe(false);
    expect(needsShrink({ size: 3_000_000, type: "image/gif" })).toBe(false);
  });
  it("matches the server's upload limit", async () => {
    process.env.DATA_DIR ??= "/tmp";
    const { MAX_UPLOAD_BYTES } = await import("@/lib/uploads");
    expect(PHOTO_LIMIT).toBe(MAX_UPLOAD_BYTES);
  });
});
