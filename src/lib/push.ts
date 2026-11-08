import "server-only";
import { all, getSetting, run, setSetting } from "./db";
import { mailFrom, siteUrl } from "./mail";

// Phone and desktop notifications through the browser's Web Push service. The server's
// VAPID key pair is made on first use and kept in settings.

export type PushMessage = { title: string; body: string; url: string; tag?: string };
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function vapidPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey;
}

async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const publicKey = getSetting("vapid_public");
  const privateKey = getSetting("vapid_private");
  if (publicKey && privateKey) return { publicKey, privateKey };
  const webpush = (await import("web-push")).default;
  const keys = webpush.generateVAPIDKeys();
  setSetting("vapid_public", keys.publicKey);
  setSetting("vapid_private", keys.privateKey);
  return keys;
}

// Only push endpoints from the browsers' own push services are accepted, so a subscription
// can't be used to make the server call addresses of someone's choosing.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/];

export function validSubscription(v: unknown): PushSub | null {
  const s = v as PushSub;
  if (!s || typeof s.endpoint !== "string" || typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") return null;
  try {
    const u = new URL(s.endpoint);
    if (u.protocol !== "https:" || !PUSH_HOSTS.some((h) => h.test(u.hostname))) return null;
  } catch {
    return null;
  }
  if (s.endpoint.length > 1000 || s.keys.p256dh.length > 200 || s.keys.auth.length > 100) return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

export function saveSubscription(userId: number, sub: PushSub) {
  run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth,
  );
}

export function removeSubscription(userId: number, endpoint: string) {
  run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", userId, endpoint);
}

export function pushDeviceCount(userId: number): number {
  return all("SELECT 1 FROM push_subscriptions WHERE user_id = ?", userId).length;
}

export async function pushToUser(userId: number, msg: PushMessage): Promise<number> {
  const subs = all<{ endpoint: string; p256dh: string; auth: string }>("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", userId);
  if (!subs.length) return 0;
  const webpush = (await import("web-push")).default;
  const keys = await vapidKeys();
  const from = mailFrom().match(/[^<\s]+@[^>\s]+/)?.[0];
  const subject = from ? `mailto:${from}` : siteUrl().startsWith("https:") ? siteUrl() : "mailto:wishes@localhost";
  const payload = JSON.stringify(msg);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
        vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60 * 24,
      });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // Gone or unknown: the browser dropped this subscription.
      if (code === 404 || code === 410) run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
      else console.error("push send failed", code ?? e);
    }
  }
  return sent;
}
