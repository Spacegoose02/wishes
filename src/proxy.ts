import { NextResponse, type NextRequest } from "next/server";
import { PATH_HEADER } from "@/lib/next";

// Tells pages which address was asked for, so a sign-in can return there afterwards.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|api/|uploads/|calendar/|favicon|icon|apple-touch-icon|manifest).*)"],
};
