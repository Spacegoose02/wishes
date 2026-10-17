import { AVATARS, Avatar } from "./Avatar";

export function AvatarPicker({ name = "avatar", value }: { name?: string; value?: string }) {
  return (
    <div className="avatar-pick">
      {AVATARS.map((a, i) => (
        <label key={a.id}>
          <input type="radio" name={name} value={a.id} defaultChecked={value ? value === a.id : i === 0} />
          <Avatar id={a.id} size={52} />
          {a.label}
        </label>
      ))}
    </div>
  );
}
