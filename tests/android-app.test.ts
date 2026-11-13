import { describe, expect, it } from "vitest";
import { isAndroidApp } from "@/lib/android-app";

describe("isAndroidApp", () => {
  it("spots the Wishes Android app by its user agent", () => {
    const ua = "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 WishesAndroid/1.0";
    expect(isAndroidApp(ua)).toBe(true);
  });

  it("leaves ordinary browsers alone", () => {
    expect(isAndroidApp("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36")).toBe(false);
    expect(isAndroidApp("")).toBe(false);
  });
});
