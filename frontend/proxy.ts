import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, currentAdmin, privateHeaders } from "@/lib/admin-auth";
import { canView } from "@/lib/viewer-auth";
export async function proxy(req: NextRequest) {
 const path=req.nextUrl.pathname;
 if(path==="/admin/login")return NextResponse.next({headers:privateHeaders});
 if(path.startsWith("/admin/")){
  if(!await currentAdmin(req.cookies.get(ACCESS_COOKIE)?.value))return NextResponse.redirect(new URL("/admin/login",req.url),{headers:privateHeaders});
  return NextResponse.next({headers:privateHeaders});
 }
 if(path==="/admin"){
  if(!await currentAdmin(req.cookies.get(ACCESS_COOKIE)?.value))return NextResponse.redirect(new URL("/admin/login",req.url),{headers:privateHeaders});
  return NextResponse.next({headers:privateHeaders});
 }
 if(path.startsWith("/viewer/")||path==="/api/viewer/auth"||path==="/api/admin/auth")return NextResponse.next({headers:privateHeaders});
 // Opt-in until owner confirms login and invitation flow on staging.
 if(process.env.VIEWER_ACCESS_ENABLED!=="true")return NextResponse.next();
 if(!await canView(req)){
  if(path.startsWith("/api/"))return NextResponse.json({error:"Approved viewer sign-in required"},{status:401,headers:privateHeaders});
  return NextResponse.redirect(new URL("/viewer/login",req.url),{headers:privateHeaders});
 }
 return NextResponse.next({headers:privateHeaders});
}
export const config={matcher:["/((?!_next/|favicon.ico|manifest.webmanifest|brand/|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)).*)"]};
