import { describe, expect, it } from "vitest";
import { extractUrls, mapLimit } from "@/lib/links";

describe("extractUrls", () => {
  it("finds links in shared text and trims trailing punctuation", () => {
    expect(extractUrls("Look at this! https://www.target.com/p/thing/-/A-123. So cute (https://amzn.to/abc)")).toEqual([
      "https://www.target.com/p/thing/-/A-123",
      "https://amzn.to/abc",
    ]);
  });
  it("dedupes, skips junk and caps the count", () => {
    expect(extractUrls("http://a.com http://a.com javascript:alert(1) ftp://x")).toEqual(["http://a.com/"]);
    expect(extractUrls(Array.from({ length: 5 }, (_, i) => `https://s.com/${i}`).join("\n"), 3)).toHaveLength(3);
  });
});

describe("mapLimit", () => {
  it("keeps order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (x) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, x));
      running--;
      return x * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
