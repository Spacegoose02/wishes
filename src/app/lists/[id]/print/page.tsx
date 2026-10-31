import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { getList, listAccess } from "@/lib/access";
import { viewToken } from "@/lib/lists";
import { siteOrigin } from "@/lib/origin";
import { makeViewLink, resetViewLink } from "../../../actions/lists";
import { ListSheet } from "@/components/ListSheet";
import { PrintButton } from "@/components/PrintButton";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Print list" };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list) notFound();
  const access = listAccess(user, list);
  if (access === "none") notFound();
  const token = viewToken(list.id);
  const link = token ? `${await siteOrigin()}/v/${token}` : null;
  const qr = link ? await QRCode.toDataURL(link, { margin: 1, width: 240 }) : null;
  return (
    <div className="narrow-760">
      <div className="row no-print mb-6">
        <Link href={`/lists/${list.id}`} className="grow">← {list.title}</Link>
        <PrintButton />
      </div>
      {access === "owner" && (
        <div className="card no-print mb-6 row">
          {token ? (
            <>
              <span className="small grow">The QR code opens a read-only view of this list (no claims or purchases). Anyone with it can look.</span>
              <form action={resetViewLink}><input type="hidden" name="list_id" value={list.id} /><SubmitButton className="btn small ghost" confirm="Old QR codes stop working. Sure?">New link</SubmitButton></form>
              <form action={resetViewLink}><input type="hidden" name="list_id" value={list.id} /><input type="hidden" name="off" value="1" /><SubmitButton className="btn small ghost" confirm="Turn the link off?">Turn off</SubmitButton></form>
            </>
          ) : (
            <>
              <span className="small grow">Add a QR code so people can open the list on their phone.</span>
              <form action={makeViewLink}><input type="hidden" name="list_id" value={list.id} /><SubmitButton className="btn small">Add QR code</SubmitButton></form>
            </>
          )}
        </div>
      )}
      <div className="print-sheet">
        <div className="row items-start">
          <div className="grow">
            <h1 className="m0">{list.emoji} {list.title}</h1>
            <p className="m0">For {list.profile_name}{list.occasion ? ` · ${list.occasion}` : ""}{list.event_date ? ` · ${new Date(list.event_date + "T00:00:00").toLocaleDateString()}` : ""}</p>
          </div>
          {qr && (
            <div className="print-qr">
              <img src={qr} alt="QR code for this list" />
            </div>
          )}
        </div>
        {list.description && <p>{list.description}</p>}
        <ListSheet listId={list.id} />
      </div>
    </div>
  );
}
