import Link from "next/link";
import { profileAge, sizeSummary } from "@/lib/profile";
import type { Profile } from "@/lib/types";

// Quick facts for shoppers: age, what they love, what to skip, and sizes.
export function AboutProfile({ p, editHref }: { p: Profile; editHref?: string }) {
  const age = profileAge(p);
  const sizes = sizeSummary(p);
  if (age === undefined && !p.likes && !p.dislikes && !sizes && !p.gift_notes) {
    return editHref ? (
      <p className="small muted" style={{ margin: "8px 0 0" }}>
        <Link href={editHref}>Add {p.name}&apos;s age, likes and sizes</Link> so shoppers and Bandit, the gift raccoon, can pick better.
      </p>
    ) : null;
  }
  return (
    <div className="card about" style={{ marginTop: 12 }}>
      <div className="row between">
        <strong>About {p.name}{age !== undefined ? `, ${age}` : ""}</strong>
        {editHref && <Link href={editHref} className="tiny">✏️ edit</Link>}
      </div>
      {p.likes && <p className="small" style={{ margin: "6px 0 0" }}>💚 <strong>Loves:</strong> {p.likes}</p>}
      {p.dislikes && <p className="small" style={{ margin: "4px 0 0" }}>🚫 <strong>Skip:</strong> {p.dislikes}</p>}
      {sizes && <p className="small" style={{ margin: "4px 0 0" }}>📏 <strong>Sizes:</strong> {sizes}</p>}
      {p.gift_notes && <p className="small muted" style={{ margin: "4px 0 0" }}>📝 {p.gift_notes}</p>}
    </div>
  );
}
