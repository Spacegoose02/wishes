import { Avatar } from "@/components/Avatar";

type Target = { id: number; title: string; emoji: string; profile_name: string; profile_avatar: string };

// "Shared with" on the add and edit forms: tick a sibling's list and the wish shows there too,
// as the same wish, so one claim covers everyone. Nothing renders when there's nobody to pick.
export function SharePicker({ targets, checked = [] }: { targets: Target[]; checked?: number[] }) {
  if (!targets.length) return null;
  return (
    <fieldset className="share-pick">
      <input type="hidden" name="share_form" value="1" />
      <legend className="small fw-700">👫 Shared with</legend>
      <p className="tiny muted m0">For something the kids will share. It shows on each list, and one claim covers all of them.</p>
      {targets.map((l) => (
        <label key={l.id} className="inline share-opt">
          <input type="checkbox" name="share_list_id" value={l.id} defaultChecked={checked.includes(l.id)} />
          <Avatar id={l.profile_avatar} size={22} />
          <span>{l.profile_name}</span>
          <span className="tiny muted">{l.emoji} {l.title}</span>
        </label>
      ))}
    </fieldset>
  );
}

// Everyone a shared wish is for, as overlapping critters.
export function ShareAvatars({ people, size = 20 }: { people: { profile_id: number; profile_avatar: string; profile_name: string }[]; size?: number }) {
  const seen = new Set<number>();
  return (
    <span className="share-avatars" aria-hidden="true">
      {people.filter((p) => !seen.has(p.profile_id) && seen.add(p.profile_id)).map((p) => (
        <Avatar key={p.profile_id} id={p.profile_avatar} size={size} title="" />
      ))}
    </span>
  );
}
