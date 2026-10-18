import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, currentAdmin, privateHeaders } from "@/lib/admin-auth";
export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/admin/login") return NextResponse.next({ headers: privateHeaders });
  if (!await currentAdmin(req.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.redirect(new URL("/admin/login", req.url), { headers: privateHeaders });
  return NextResponse.next({ headers: privateHeaders });
}
export const config = { matcher: ["/admin/:path*"] };
