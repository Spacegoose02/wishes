import Link from "next/link";
import { Avatar } from "@/components/Avatar";

export default function NotFound() {
  return (
    <div className="empty mt-60">
      <div className="row justify-center"><Avatar id="raccoon" size={80} /></div>
      <h1 className="mt-16">Nothing here</h1>
      <p>This raccoon searched everywhere. That page doesn&apos;t exist, or it isn&apos;t shared with you.</p>
      <Link href="/" className="btn">Go home</Link>
    </div>
  );
}
