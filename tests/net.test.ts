import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedIp, PrivateAddressError } from "@/lib/scrape/net";

describe("isBlockedIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:192.168.1.1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (ip) => expect(isBlockedIp(ip)).toBe(true),
  );

  it.each(["8.8.8.8", "172.32.0.1", "23.45.67.89", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));

  it("treats garbage as blocked", () => expect(isBlockedIp("not-an-ip")).toBe(true));
});

describe("assertPublicUrl", () => {
  it.each(["http://localhost:3000/", "http://nas.local/", "http://router.lan/", "http://192.168.0.1/", "http://[::1]/", "file:///etc/passwd"])(
    "refuses %s",
    async (u) => expect(assertPublicUrl(new URL(u))).rejects.toBeInstanceOf(PrivateAddressError),
  );

  it("allows a public IP without a DNS lookup", async () => {
    await expect(assertPublicUrl(new URL("https://8.8.8.8/"))).resolves.toBeUndefined();
  });
});
