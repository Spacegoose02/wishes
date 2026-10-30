import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { myFamilies } from "@/lib/access";
import {
  connectFamily, createFamily, disconnectFamily, joinFamily, leaveFamily, newInviteCode, removeMember, setMemberRole,
} from "../actions/app";
import { Avatar } from "@/components/Avatar";
import { CopyButton } from "@/components/CopyButton";
import { RenameKid } from "@/components/RenameKid";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

type Member = { id: number; name: string; avatar: string; role: string };

export default async function FamiliesPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const families = myFamilies(user.id);
  return (
    <>
      <h1>Families</h1>
      <p className="muted">A family is everyone who can see each other&apos;s lists. Connect another family (like the grandparents&apos; house) to share specific lists with them too.</p>
      <Flash searchParams={searchParams} />

      <div className="grid" style={{ marginTop: 12 }}>
        <form action={createFamily} className="card stack">
          <h2>Start a family</h2>
          <label>Family name<input name="name" placeholder="The Underwoods" required /></label>
          <button className="btn">Create</button>
        </form>
        <form action={joinFamily} className="card stack">
          <h2>Join with a code</h2>
          <label>Invite code<input name="code" placeholder="GOOSE-AB12C" required style={{ textTransform: "uppercase" }} /></label>
          <button className="btn secondary">Join</button>
        </form>
      </div>

      {families.map((f) => {
        const members = all<Member>(
          "SELECT u.id, u.name, u.avatar, m.role FROM family_members m JOIN users u ON u.id = m.user_id WHERE m.family_id = ? ORDER BY m.role, u.name", f.id,
        );
        // Kid profiles only; stand-in profiles for secret lists stay out of sight.
        const kids = all<{ id: number; name: string; avatar: string; parent: string }>(
          `SELECT p.id, p.name, p.avatar, u.name AS parent FROM profiles p JOIN users u ON u.id = p.user_id
           JOIN family_members m ON m.user_id = p.user_id WHERE m.family_id = ? AND p.is_primary = 0 AND p.linked_user_id IS NULL ORDER BY p.name`, f.id,
        );
        const links = all<{ id: number; name: string }>(
          `SELECT f2.id, f2.name FROM family_links l JOIN families f2 ON f2.id = (CASE WHEN l.family_a = ? THEN l.family_b ELSE l.family_a END)
           WHERE l.family_a = ? OR l.family_b = ?`, f.id, f.id, f.id,
        );
        const admin = f.role === "admin";
        return (
          <section key={f.id} className="card section">
            <div className="section-head">
              <h2 style={{ margin: 0 }}>🏡 {f.name}</h2>
              <div className="row" style={{ gap: 6 }}>
                <span className="small muted">Invite code</span>
                <span className="code">{f.invite_code}</span>
                <CopyButton text={f.invite_code} />
                {admin && (
                  <form action={newInviteCode}><input type="hidden" name="family_id" value={f.id} /><button className="btn small ghost">New code</button></form>
                )}
              </div>
            </div>
            <table className="table">
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td><span className="row" style={{ gap: 8 }}><Avatar id={m.avatar} size={30} />{m.name}{m.role === "admin" && <span className="pill">admin</span>}</span></td>
                    <td style={{ textAlign: "right" }}>
                      {admin && m.id !== user.id && (
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          <form action={setMemberRole}>
                            <input type="hidden" name="family_id" value={f.id} />
                            <input type="hidden" name="user_id" value={m.id} />
                            <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                            <button className="btn small ghost">{m.role === "admin" ? "Make member" : "Make admin"}</button>
                          </form>
                          <form action={removeMember}>
                            <input type="hidden" name="family_id" value={f.id} />
                            <input type="hidden" name="user_id" value={m.id} />
                            <SubmitButton className="btn small danger" confirm={`Remove ${m.name}?`}>Remove</SubmitButton>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {kids.map((k) => (
                  <tr key={`k${k.id}`}>
                    <td><span className="row" style={{ gap: 8 }}><Avatar id={k.avatar} size={30} />{k.name}<span className="pill">profile managed by {k.parent}</span></span></td>
                    <td style={{ textAlign: "right" }}><RenameKid id={k.id} name={k.name} back="/families" /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="section">
              <h3>Connected families</h3>
              {links.length === 0 && <p className="small muted">None yet.</p>}
              <div className="row" style={{ gap: 6 }}>
                {links.map((l) => (
                  <span key={l.id} className="pill" style={{ padding: "4px 4px 4px 12px" }}>
                    {l.name}
                    {admin && (
                      <form action={disconnectFamily} style={{ display: "inline" }}>
                        <input type="hidden" name="family_id" value={f.id} />
                        <input type="hidden" name="other_id" value={l.id} />
                        <SubmitButton className="btn small ghost" style={{ minHeight: 24, padding: "0 8px" }} aria-label={`Disconnect ${l.name}`} confirm="Disconnect?">×</SubmitButton>
                      </form>
                    )}
                  </span>
                ))}
              </div>
              {admin && (
                <form action={connectFamily} className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
                  <input type="hidden" name="family_id" value={f.id} />
                  <label style={{ flex: 1, minWidth: 180 }}>Their invite code<input name="code" required style={{ textTransform: "uppercase" }} /></label>
                  <button className="btn secondary">Connect</button>
                </form>
              )}
            </div>

            <form action={leaveFamily} style={{ marginTop: 16 }}>
              <input type="hidden" name="family_id" value={f.id} />
              <SubmitButton className="btn small ghost" confirm={`Really leave ${f.name}?`}>Leave {f.name}</SubmitButton>
            </form>
          </section>
        );
      })}
    </>
  );
}
