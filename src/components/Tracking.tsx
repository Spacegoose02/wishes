import { detectCarrier, trackingUrl } from "@/lib/tracking";
import { saveTracking } from "@/app/actions/purchases";
import { SubmitButton } from "./SubmitButton";

type P = { id: number; tracking: string; carrier: string; expected_at: string | null };

// Shipping status for one purchase, plus a small form to add or change it.
export function Tracking({ p, back, editable = true }: { p: P; back: string; editable?: boolean }) {
  const carrier = p.carrier || detectCarrier(p.tracking);
  const url = p.tracking ? trackingUrl(p.tracking, carrier) : "";
  return (
    <div className="tiny mt-4">
      {(p.tracking || p.expected_at) && (
        <span className="pill">
          📦 {p.tracking ? (url ? <a href={url} target="_blank" rel="noopener noreferrer">{carrier} {p.tracking}</a> : `${carrier ? carrier + " " : ""}${p.tracking}`) : "Shipping"}
          {p.expected_at && ` · arrives ${new Date(p.expected_at + "T00:00:00").toLocaleDateString()}`}
        </span>
      )}
      {editable && (
        <details className="inline-form">
          <summary className="linkish">{p.tracking || p.expected_at ? "edit shipping" : "add tracking"}</summary>
          <form action={saveTracking} className="row mt-6 items-end">
            <input type="hidden" name="purchase_id" value={p.id} />
            <input type="hidden" name="back" value={back} />
            <label className="grow min-180">Tracking number<input name="tracking" defaultValue={p.tracking} placeholder="1Z999AA10123456784" /></label>
            <label>Arrives<input name="expected_at" type="date" defaultValue={p.expected_at ?? ""} /></label>
            <SubmitButton className="btn small secondary">Save</SubmitButton>
          </form>
        </details>
      )}
    </div>
  );
}
