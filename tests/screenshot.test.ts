import { describe, expect, it } from "vitest";
import { cleanBox, cropRect, parseScreenshotReply, SCREENSHOT_SCHEMA } from "@/lib/screenshot";

describe("reading a product screenshot", () => {
  it("turns a full reply into form values", () => {
    const info = parseScreenshotReply(JSON.stringify({
      found: true, title: "  LEGO Botanicals   Bonsai Tree 10281 ", price: 49.99, store: "Target", url: "https://www.target.com/p/lego-bonsai/-/A-123",
      variant: "", color: "", size: "", category: "toys", notes: "The 878-piece set.", box: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
    }));
    expect(info).toEqual({
      found: true, title: "LEGO Botanicals Bonsai Tree 10281", price_cents: 4999, store: "Target", url: "https://www.target.com/p/lego-bonsai/-/A-123",
      variant: "", color: "", size: "", category: "toys", notes: "The 878-piece set.", box: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
    });
  });

  it("copes with chatty replies from non-Claude models", () => {
    const info = parseScreenshotReply('Sure! ```json\n{"title":"Squishmallow Cam the Cat","price":"$19.99","category":"made-up","url":"target.com"}\n```');
    expect(info.title).toBe("Squishmallow Cam the Cat");
    expect(info.price_cents).toBe(1999);
    expect(info.category).toBe("");
    expect(info.url).toBe("");
    expect(info.box).toBeUndefined();
    expect(info.found).toBe(true);
  });

  it("reports nothing found when the model says so or gives no name", () => {
    expect(parseScreenshotReply('{"found":false,"title":"cat"}').found).toBe(false);
    expect(parseScreenshotReply('{"found":true,"title":"  "}').found).toBe(false);
  });

  it("drops zero, negative and silly prices", () => {
    expect(parseScreenshotReply('{"title":"A","price":0}').price_cents).toBeUndefined();
    expect(parseScreenshotReply('{"title":"A","price":-5}').price_cents).toBeUndefined();
    expect(parseScreenshotReply('{"title":"A","price":99999999}').price_cents).toBeUndefined();
  });

  it("rejects replies that aren't JSON", () => {
    expect(() => parseScreenshotReply("I can't read that.")).toThrow(/expected format/);
    expect(() => parseScreenshotReply("{not json}")).toThrow(/expected format/);
  });

  it("keeps only sensible photo boxes, clipped to the picture", () => {
    expect(cleanBox({ x: 0, y: 0, w: 0, h: 0 })).toBeUndefined();
    expect(cleanBox(null)).toBeUndefined();
    expect(cleanBox({ x: 0.8, y: -1, w: 0.9, h: 2 })).toEqual({ x: 0.8, y: 0, w: 0.19999999999999996, h: 1 });
  });

  it("pads the crop a little and stays inside the image", () => {
    expect(cropRect({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 1000, 2000)).toEqual({ sx: 80, sy: 160, sw: 540, sh: 1080 });
    expect(cropRect({ x: 0, y: 0, w: 1, h: 1 }, 400, 300)).toEqual({ sx: 0, sy: 0, sw: 400, sh: 300 });
  });

  it("asks for every field the form fills", () => {
    expect(SCREENSHOT_SCHEMA.required).toEqual(expect.arrayContaining(["title", "price", "store", "category", "box"]));
  });
});
