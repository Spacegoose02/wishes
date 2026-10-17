import { AVATARS, Avatar, avatarLabel, avatarTier, TIER_LABEL } from "./Avatar";

// Static critters plus whatever the user has rolled into their collection.
export function AvatarPicker({ name = "avatar", value, collection = [] }: { name?: string; value?: string; collection?: string[] }) {
  const ids = [...new Set([...collection, ...AVATARS.map((a) => a.id), ...(value ? [value] : [])])];
  return (
    <div className="avatar-pick">
      {ids.map((id, i) => {
        const tier = avatarTier(id);
        return (
          <label key={id} className={`tier-${tier}`}>
            <input type="radio" name={name} value={id} defaultChecked={value ? value === id : i === 0} />
            <Avatar id={id} size={52} />
            <span>{avatarLabel(id)}</span>
            {tier !== "common" && <span className={`tier tier-${tier}`}>{TIER_LABEL[tier]}</span>}
          </label>
        );
      })}
    </div>
  );
}

export function parseCollection(raw: string | null | undefined): string[] {
  return (raw ?? "").split(",").filter(Boolean);
}
