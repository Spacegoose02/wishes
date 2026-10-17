import Link from "next/link";
import { Avatar } from "@/components/Avatar";

export default function NotFound() {
  return (
    <div className="empty" style={{ marginTop: 60 }}>
      <div className="row" style={{ justifyContent: "center" }}><Avatar id="raccoon" size={80} /></div>
      <h1 style={{ marginTop: 16 }}>Nothing here</h1>
      <p>This raccoon searched everywhere. That page doesn&apos;t exist, or it isn&apos;t shared with you.</p>
      <Link href="/" className="btn">Go home</Link>
    </div>
  );
}
