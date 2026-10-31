import { describe, expect, it } from "vitest";
import { nextQuery, safeNext } from "@/lib/next";

describe("return to a page after sign-in", () => {
  it("keeps pages inside Wishes", () => {
    expect(safeNext("/lists/4?add=https%3A%2F%2Fx.com")).toBe("/lists/4?add=https%3A%2F%2Fx.com");
    expect(safeNext("/share?url=x")).toBe("/share?url=x");
  });
  it("sends anything else home", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil", "", undefined, 5, "/login", "/login?next=/x", "/register", "/auth/oidc/start", "/api/chat"]) {
      expect(safeNext(bad)).toBe("/");
    }
    expect(safeNext("/loginx")).toBe("/loginx");
  });
  it("only adds a next= when it leads somewhere", () => {
    expect(nextQuery("/")).toBe("");
    expect(nextQuery("//evil.com")).toBe("");
    expect(nextQuery("/lists/2")).toBe("?next=%2Flists%2F2");
    expect(nextQuery("/lists/2", "&")).toBe("&next=%2Flists%2F2");
  });
});
