import { NextRequest, NextResponse } from "next/server";
import { authClient, currentAdmin, privateHeaders } from "@/lib/admin-auth";
export const VIEWER_COOKIE="sach-viewer-access";
export async function approvedViewer(token?:string){
 if(!token||token.length>8000)return null;
 try{
  const client=authClient();
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user?.id||!data.user.email_confirmed_at||data.user.is_anonymous)return null;
  const {data:access,error:dbError}=await client.from("dashboard_viewer_access").select("status").eq("user_id",data.user.id).maybeSingle();
  return !dbError&&access?.status==="approved"?data.user:null;
 }catch{return null;}
}
export async function canView(req:NextRequest){
 if(await currentAdmin(req.cookies.get("sach-admin-access")?.value))return true;
 return Boolean(await approvedViewer(req.cookies.get(VIEWER_COOKIE)?.value));
}
export function viewerResponse(body:any,status=200){return NextResponse.json(body,{status,headers:privateHeaders});}
export function setViewerCookie(res:NextResponse,token:string,expires=3600){
 res.cookies.set(VIEWER_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:Math.min(expires,3600)});
 return res;
}
