import { renameProfile } from "@/app/actions/account";
import { SubmitButton } from "@/components/SubmitButton";

// Small "✏️ Rename" that opens an inline box right next to a kid's name.
export function RenameKid({ id, name, back }: { id: number; name: string; back: string }) {
  return (
    <details className="rename">
      <summary className="btn small ghost">✏️ Rename</summary>
      <form action={renameProfile} className="rename-form">
        <input type="hidden" name="profile_id" value={id} />
        <input type="hidden" name="back" value={back} />
        <input name="name" defaultValue={name} aria-label={`New name for ${name}`} required maxLength={60} />
        <SubmitButton className="btn small">Save</SubmitButton>
      </form>
    </details>
  );
}
