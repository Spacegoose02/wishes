import { afterEach, describe, expect, it, vi } from "vitest";
import { base32Encode, hashPassword, totpUri, verifyPassword, verifyTotp } from "@/lib/crypto";

// RFC 6238 test secret ("12345678901234567890"), whose 6-digit code at T=59s is 287082.
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("passwords", () => {
  it("verifies the right password and rejects others", () => {
    const h = hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });

  it("salts every hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("rejects missing or malformed hashes", () => {
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "md5$abc$def")).toBe(false);
  });
});

describe("TOTP", () => {
  afterEach(() => vi.useRealTimers());

  it("matches the RFC 6238 test vector", () => {
    vi.useFakeTimers();
    vi.setSystemTime(59_000);
    expect(verifyTotp(SECRET, "287082")).toBe(true);
    expect(verifyTotp(SECRET, "287 082")).toBe(true);
  });

  it("allows one step of clock drift but not two", () => {
    vi.useFakeTimers();
    vi.setSystemTime(59_000 + 30_000);
    expect(verifyTotp(SECRET, "287082")).toBe(true);
    vi.setSystemTime(59_000 + 90_000);
    expect(verifyTotp(SECRET, "287082")).toBe(false);
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(SECRET, "12345")).toBe(false);
    expect(verifyTotp(SECRET, "abcdef")).toBe(false);
  });

  it("builds an authenticator URI", () => {
    expect(totpUri("ABC", "me@example.com")).toBe("otpauth://totp/Wishes:me%40example.com?secret=ABC&issuer=Wishes&period=30&digits=6");
  });
});
