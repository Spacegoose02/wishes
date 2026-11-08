import "server-only";
import { get, run } from "./db";
import { sendMail, mailEnabled, siteUrl } from "./mail";
import { pushToUser } from "./push";

// Every alert lands in the in-app Alerts page, and is also sent by email and to the phones
// the person turned push on for (each one can be switched off in Settings).
export function notify(userId: number, kind: string, message: string, link = "") {
  run("INSERT INTO notifications (user_id, kind, message, link) VALUES (?, ?, ?, ?)", userId, kind, message, link);
  deliver(userId, kind, message, link);
}

// Like notify, but folds repeats into one unread alert (e.g. "3 new wishes on Maya's list"),
// so a burst of activity doesn't send a burst of emails. Only the first one is delivered.
export function notifyOnce(userId: number, kind: string, link: string, message: (count: number) => string, add = 1) {
  const open = get<{ id: number; count: number }>(
    "SELECT id, count FROM notifications WHERE user_id = ? AND kind = ? AND link = ? AND read = 0 AND created_at > unixepoch() - 86400 ORDER BY id DESC LIMIT 1",
    userId, kind, link,
  );
  if (open) {
    run("UPDATE notifications SET count = count + ?, message = ? WHERE id = ?", add, message(open.count + add), open.id);
    return;
  }
  run("INSERT INTO notifications (user_id, kind, message, link, count) VALUES (?, ?, ?, ?, ?)", userId, kind, message(add), link, add);
  deliver(userId, kind, message(add), link);
}

type Prefs = { email: string; name: string; alert_email: number; alert_push: number };

function deliver(userId: number, kind: string, message: string, link: string) {
  if (process.env.VITEST) return;
  const u = get<Prefs>("SELECT email, name, alert_email, alert_push FROM users WHERE id = ?", userId);
  if (!u) return;
  const url = link ? `${siteUrl()}${link}` : siteUrl();
  if (u.alert_email && mailEnabled()) {
    sendMail(u.email, emailSubject(message), emailBody(u.name, message, url)).catch((e) => console.error("alert email failed", e));
  }
  if (u.alert_push) {
    pushToUser(userId, { title: TITLES[kind] ?? "Wishes", body: message, url: link || "/notifications", tag: `${kind}:${link}` })
      .catch((e) => console.error("push failed", e));
  }
}

const TITLES: Record<string, string> = {
  deal: "🏷️ Price drop", family: "🏡 Family news", purchase: "🧾 Purchase", approval: "🧒 Wish to approve",
  badge: "🌟 New badge", pledge: "🤝 Group gift", reminder: "⏰ Reminder", santa: "🎅 Secret Santa",
  thanks: "💌 Thank-you", unwanted: "🙅 Change of plans", question: "❓ Question", answer: "💬 Answer",
  new_wishes: "✨ New wishes",
};

export function emailSubject(message: string): string {
  const one = message.replace(/\s+/g, " ").trim();
  return `Wishes: ${one.length > 70 ? one.slice(0, 67).trimEnd() + "…" : one}`;
}

export function emailBody(name: string, message: string, url: string): { text: string; html: string } {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const text = `Hi ${name},\n\n${message}\n\nOpen Wishes: ${url}\n\nYou can turn these emails off in Wishes under Settings, Alerts.`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#222;max-width:520px">
<p>Hi ${esc(name)},</p><p>${esc(message)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#ff7a59;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open Wishes</a></p>
<p style="font-size:13px;color:#777">You can turn these emails off in Wishes under Settings, Alerts.</p></div>`;
  return { text, html };
}
