"use server";
import { redirect } from "next/navigation";
import { all, get, run, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/prices";
import { s, n, inviteCode, familyAdmin } from "./_shared";

export async function createFamily(form: FormData) {
  const user = await requireUser();
  const name = s(form, "name");
  if (!name) redirect("/families?error=Name+your+family");
  tx(() => {
    const r = run("INSERT INTO families (name, invite_code, created_by) VALUES (?, ?, ?)", name, inviteCode(), user.id);
    run("INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, 'admin')", Number(r.lastInsertRowid), user.id);
  });
  redirect("/families?ok=Family+created");
}

export async function joinFamily(form: FormData) {
  const user = await requireUser();
  const fam = get<{ id: number; name: string }>("SELECT id, name FROM families WHERE invite_code = ?", s(form, "code").toUpperCase());
  if (!fam) redirect("/families?error=No+family+has+that+code");
  run("INSERT OR IGNORE INTO family_members (family_id, user_id) VALUES (?, ?)", fam.id, user.id);
  for (const m of all<{ user_id: number }>("SELECT user_id FROM family_members WHERE family_id = ? AND user_id != ?", fam.id, user.id)) {
    notify(m.user_id, "family", `${user.name} joined ${fam.name}`, "/families");
  }
  redirect(`/families?ok=${encodeURIComponent(`Welcome to ${fam.name}!`)}`);
}

export async function leaveFamily(form: FormData) {
  const user = await requireUser();
  const fid = n(form, "family_id");
  tx(() => {
    run("DELETE FROM family_members WHERE family_id = ? AND user_id = ?", fid, user.id);
    const left = get<{ n: number }>("SELECT COUNT(*) AS n FROM family_members WHERE family_id = ?", fid)!.n;
    if (left === 0) run("DELETE FROM families WHERE id = ?", fid);
    else if (!get("SELECT 1 FROM family_members WHERE family_id = ? AND role = 'admin'", fid)) {
      run("UPDATE family_members SET role = 'admin' WHERE rowid = (SELECT MIN(rowid) FROM family_members WHERE family_id = ?)", fid);
    }
  });
  redirect("/families?ok=You+left+the+family");
}

export async function removeMember(form: FormData) {
  const fid = n(form, "family_id");
  const admin = await familyAdmin(fid);
  const uid = n(form, "user_id");
  if (uid !== admin.id) run("DELETE FROM family_members WHERE family_id = ? AND user_id = ?", fid, uid);
  redirect("/families");
}

export async function setMemberRole(form: FormData) {
  const fid = n(form, "family_id");
  await familyAdmin(fid);
  run("UPDATE family_members SET role = ? WHERE family_id = ? AND user_id = ?", s(form, "role") === "admin" ? "admin" : "member", fid, n(form, "user_id"));
  redirect("/families");
}

export async function newInviteCode(form: FormData) {
  const fid = n(form, "family_id");
  await familyAdmin(fid);
  run("UPDATE families SET invite_code = ? WHERE id = ?", inviteCode(), fid);
  redirect("/families?ok=New+invite+code+made");
}

export async function connectFamily(form: FormData) {
  const fid = n(form, "family_id");
  await familyAdmin(fid);
  const other = get<{ id: number }>("SELECT id FROM families WHERE invite_code = ?", s(form, "code").toUpperCase());
  if (!other || other.id === fid) redirect("/families?error=No+other+family+has+that+code");
  const [a, b] = fid < other.id ? [fid, other.id] : [other.id, fid];
  run("INSERT OR IGNORE INTO family_links (family_a, family_b) VALUES (?, ?)", a, b);
  redirect("/families?ok=Families+connected");
}

export async function disconnectFamily(form: FormData) {
  const fid = n(form, "family_id");
  await familyAdmin(fid);
  const other = n(form, "other_id");
  run("DELETE FROM family_links WHERE (family_a = ? AND family_b = ?) OR (family_a = ? AND family_b = ?)", fid, other, other, fid);
  redirect("/families?ok=Disconnected");
}
