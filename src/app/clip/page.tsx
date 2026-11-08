import { requireUser } from "@/lib/auth";
import { ClipReceiver } from "./ClipReceiver";

export const metadata = { title: "Add to Wishes" };

// Opened by the "Add to Wishes" bookmark (see Settings). The store's tab sends its page here.
export default async function ClipPage() {
  await requireUser();
  return (
    <div className="narrow-640">
      <h1>✨ Add to Wishes</h1>
      <ClipReceiver />
    </div>
  );
}
