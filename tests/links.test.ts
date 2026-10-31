import { describe, expect, it } from "vitest";
import { extractUrls } from "@/lib/links";

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
