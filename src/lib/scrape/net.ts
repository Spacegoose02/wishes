import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

// Addresses autofill must never reach, so a pasted link can't be used to probe the LAN.
const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) BLOCKED.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96],
] as const) BLOCKED.addSubnet(addr, prefix, "ipv6");

export class PrivateAddressError extends Error {
  constructor() {
    super("Private network addresses can't be autofilled.");
  }
}

export function isBlockedIp(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return isBlockedIp(mapped);
  const family = net.isIP(ip);
  if (!family) return true;
  return BLOCKED.check(ip, family === 4 ? "ipv4" : "ipv6");
}

function isPrivateName(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa");
}

// Checks the name and every address it resolves to.
export async function assertPublicUrl(url: URL): Promise<void> {
  if (!/^https?:$/.test(url.protocol)) throw new PrivateAddressError();
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isPrivateName(host)) throw new PrivateAddressError();
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new PrivateAddressError();
    return;
  }
  const addrs = await dns.lookup(host, { all: true, verbatim: true }).catch(() => {
    throw new Error("Couldn't find that website. Check the link?");
  });
  if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) throw new PrivateAddressError();
}

const MAX_REDIRECTS = 5;

// fetch() that re-checks every redirect hop, so a public link can't bounce into the LAN.
export async function safeFetch(url: URL, init: RequestInit = {}): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) {
      Object.defineProperty(res, "url", { value: current.toString() });
      return res;
    }
    await res.body?.cancel();
    current = new URL(location, current);
  }
  throw new Error("Too many redirects.");
}

// Reads at most `limit` characters so a huge page can't eat the server's memory.
export async function readText(res: Response, limit = 4_000_000): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (out.length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return out.slice(0, limit);
}
