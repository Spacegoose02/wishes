import { redirect } from "next/navigation";

// The chat lives on the Chat tab now; keep old links working.
export default async function ListChatRedirect({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/chat?list=${(await params).id}`);
}
