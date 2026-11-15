import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { User } from "@/lib/types";

let h: Awaited<ReturnType<typeof testDb>>;
let sso: typeof import("@/lib/sso");
let oidc: typeof import("@/lib/oidc");
beforeAll(async () => {
  h = await testDb();
  sso = await import("@/lib/sso");
  oidc = await import("@/lib/oidc");
});

const cfg = (o: Partial<{ autoCreate: boolean; familyId: number | null }> = {}) => ({ name: "TinyAuth", autoCreate: true, familyId: null, ...o });
const reload = (u: User) => h.db.get<User>("SELECT * FROM users WHERE id = ?", u.id)!;

describe("single sign-on accounts", () => {
  it("links a login to the account with the same email", () => {
    const ann = h.user("ann");
    const r = sso.resolveSso({ sub: "s-ann", email: "ANN@example.com" }, cfg());
    expect(r.ok && r.user.id).toBe(ann.id);
    expect(reload(ann).oidc_sub).toBe("s-ann");
    const again = sso.resolveSso({ sub: "s-ann", email: "changed@example.com" }, cfg());
    expect(again.ok && again.user.id).toBe(ann.id);
  });

  it("won't take over an account through an unverified email", () => {
    h.user("bob");
    const r = sso.resolveSso({ sub: "s-evil", email: "bob@example.com", email_verified: false }, cfg());
    expect(r.ok).toBe(false);
  });

  it("won't swap an account to a different login with the same email", () => {
    h.user("cat");
    expect(sso.resolveSso({ sub: "s-cat", email: "cat@example.com" }, cfg()).ok).toBe(true);
    expect(sso.resolveSso({ sub: "s-cat-2", email: "cat@example.com" }, cfg()).ok).toBe(false);
  });

  it("makes a grown-up, non-admin account in the chosen family when allowed", () => {
    const fam = h.family("Smiths");
    const r = sso.resolveSso({ sub: "s-new", email: "new@example.com", name: "New Person" }, cfg({ familyId: fam }));
    expect(r.ok && r.created).toBe(true);
    if (!r.ok) return;
    expect(r.user.is_admin).toBe(0);
    expect(r.user.name).toBe("New Person");
    expect(h.db.get("SELECT 1 AS x FROM profiles WHERE user_id = ? AND is_primary = 1", r.user.id)).toBeTruthy();
    expect(h.db.get<{ role: string }>("SELECT role FROM family_members WHERE family_id = ? AND user_id = ?", fam, r.user.id)?.role).toBe("member");
  });

  it("turns strangers away when new accounts are off", () => {
    const r = sso.resolveSso({ sub: "s-stranger", email: "stranger@example.com" }, cfg({ autoCreate: false }));
    expect(r.ok).toBe(false);
    expect(h.db.get("SELECT 1 FROM users WHERE email = 'stranger@example.com'")).toBeUndefined();
  });

  it("links from Settings only when the login is free", () => {
    const dee = h.user("dee");
    const eve = h.user("eve");
    expect(sso.linkSso(dee, { sub: "s-dee" }, cfg()).ok).toBe(true);
    expect(sso.linkSso(eve, { sub: "s-dee" }, cfg()).ok).toBe(false);
    expect(reload(eve).oidc_sub).toBeNull();
  });

  it("won't unlink someone with no password", () => {
    const fay = h.user("fay");
    sso.linkSso(fay, { sub: "s-fay" }, cfg());
    expect(sso.unlinkSso(reload(fay)).ok).toBe(false);
    h.db.run("UPDATE users SET password_hash = 'x' WHERE id = ?", fay.id);
    expect(sso.unlinkSso(reload(fay)).ok).toBe(true);
    expect(reload(fay).oidc_sub).toBeNull();
  });
});

describe("admin linking", () => {
  it("links the chosen account when that email next signs in", () => {
    const gus = h.user("gus");
    expect(sso.adminLinkSso(gus.id, "Gus.Tiny@example.org").ok).toBe(true);
    const r = sso.resolveSso({ sub: "s-gus", email: "gus.tiny@example.org" }, cfg({ autoCreate: false }));
    expect(r.ok && r.user.id).toBe(gus.id);
    expect(reload(gus).sso_link_email).toBeNull();
    sso.adminUnlinkSso(gus.id);
    expect(reload(gus).oidc_sub).toBeNull();
  });

  it("won't point an email at two people", () => {
    const hal = h.user("hal");
    const ivy = h.user("ivy");
    expect(sso.adminLinkSso(hal.id, "shared@example.org").ok).toBe(true);
    expect(sso.adminLinkSso(ivy.id, "shared@example.org").ok).toBe(false);
    expect(sso.adminLinkSso(ivy.id, "hal@example.com").ok).toBe(false);
  });
});

describe("provider settings", () => {
  it("prefers saved settings over environment variables", () => {
    process.env.OIDC_ISSUER = "https://env.example.com";
    process.env.OIDC_CLIENT_ID = "env-id";
    expect(oidc.oidcConfig()?.issuer).toBe("https://env.example.com");
    h.db.setSetting("oidc_issuer", "https://auth.example.net/");
    h.db.setSetting("oidc_scopes", "groups, openid");
    h.db.setSetting("oidc_show_button", "0");
    const c = oidc.oidcConfig()!;
    expect(c.issuer).toBe("https://auth.example.net");
    expect(c.clientId).toBe("env-id");
    expect(c.scopes).toBe("openid profile email groups");
    expect(c.showButton).toBe(false);
    h.db.setSetting("oidc_issuer", "");
    expect(oidc.oidcConfig()).toBeNull();
  });
});
