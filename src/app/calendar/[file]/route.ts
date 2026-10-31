import { buildIcs, calendarEvents, userByCalendarToken } from "@/lib/calendar";
import { siteOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

// /calendar/<token>.ics: subscribe to it from any calendar app.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = userByCalendarToken((await params).file.replace(/\.ics$/, ""));
  if (!user) return new Response("Not found", { status: 404 });
  return new Response(buildIcs(calendarEvents(user, await siteOrigin())), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="wishes.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
