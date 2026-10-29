import { parseSizes, SIZE_FIELDS } from "@/lib/profile";
import type { Profile } from "@/lib/types";

// Likes, sizes and age: shown to gift-givers and used by the AI gift helper.
export function ProfileDetailsFields({ p, showAge = true }: { p?: Partial<Profile>; showAge?: boolean }) {
  const sizes = parseSizes(p?.sizes);
  return (
    <fieldset className="stack" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, margin: 0 }}>
      <legend className="small" style={{ fontWeight: 700, padding: "0 6px" }}>For gift-givers and the gift helper</legend>
      <div className="form-grid">
        {showAge && (
          <label>Age (if no birthday)<input name="age" type="number" min={0} max={120} defaultValue={p?.age ?? ""} placeholder="7" /></label>
        )}
        <label className="full">Loves / into right now<textarea name="likes" defaultValue={p?.likes ?? ""} placeholder="Dinosaurs, Bluey, drawing, purple, soccer, mystery books" style={{ minHeight: 60 }} /></label>
        <label className="full">Not into / please avoid<textarea name="dislikes" defaultValue={p?.dislikes ?? ""} placeholder="Slime, loud toys, anything scary, already has a Switch" style={{ minHeight: 60 }} /></label>
      </div>
      <p className="small" style={{ fontWeight: 600, margin: "4px 0 0" }}>Sizes</p>
      <div className="form-grid">
        {SIZE_FIELDS.map((f) => (
          <label key={f.id}>{f.label}<input name={`size_${f.id}`} defaultValue={sizes[f.id] ?? ""} placeholder={f.placeholder} /></label>
        ))}
      </div>
      <label>Other notes for shoppers<textarea name="gift_notes" defaultValue={p?.gift_notes ?? ""} placeholder="Prefers experiences over stuff; collects Hot Wheels; allergic to latex" style={{ minHeight: 60 }} /></label>
    </fieldset>
  );
}
