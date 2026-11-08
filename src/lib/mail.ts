import "server-only";
import { getSetting } from "./db";

// Outgoing email (alerts and password resets) through any SMTP server: Gmail, Fastmail,
// Proton Bridge, Mailgun, your own Postfix... Set in Settings → Server, or with SMTP_URL.

export function smtpUrl(): string {
  return getSetting("smtp_url") || process.env.SMTP_URL || "";
}

export function mailFrom(): string {
  return getSetting("smtp_from") || process.env.SMTP_FROM || "";
}

export function mailEnabled(): boolean {
  return !!smtpUrl() && !!mailFrom();
}

// The public address for links in emails and phone alerts, which go out from background jobs
// where there's no request to read it from.
export function siteUrl(): string {
  return (getSetting("site_url") || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function sendMail(to: string, subject: string, body: { text: string; html?: string }): Promise<void> {
  if (!mailEnabled()) throw new Error("Email isn't set up on this server.");
  const mod = (await import("nodemailer")) as typeof import("nodemailer") & { default?: typeof import("nodemailer") };
  const nodemailer = mod.default ?? mod;
  const transport = nodemailer.createTransport(smtpUrl());
  await transport.sendMail({ from: mailFrom(), to, subject, text: body.text, html: body.html });
}

// Describes the SMTP URL without its password, for the admin page.
export function describeSmtp(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol.replace(":", "")}://${u.username ? `${decodeURIComponent(u.username)}@` : ""}${u.host}`;
  } catch {
    return "not a valid URL";
  }
}
