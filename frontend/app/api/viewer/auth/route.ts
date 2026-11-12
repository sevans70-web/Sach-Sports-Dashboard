import { NextRequest } from "next/server";
import { authClient, mutationAllowed } from "@/lib/admin-auth";
import { approvedViewer, setViewerCookie, VIEWER_COOKIE, viewerResponse } from "@/lib/viewer-auth";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const user=await approvedViewer(req.cookies.get(VIEWER_COOKIE)?.value);
 return viewerResponse({authenticated:Boolean(user),email:user?.email||null},user?200:401);
}
export async function POST(req:NextRequest){
 if(!mutationAllowed(req))return viewerResponse({error:"Invalid origin"},403);
 if(Number(req.headers.get("content-length")||0)>4096)return viewerResponse({error:"Request too large"},413);
 const body=await req.json().catch(()=>null);
 if(body?.action==="setup"){
  const accessToken=String(body.accessToken||""),refreshToken=String(body.refreshToken||""),newPassword=String(body.newPassword||"");
  if(accessToken.length>8000||refreshToken.length>8000||newPassword.length<12||newPassword.length>1024)return viewerResponse({error:"Invalid setup details; password must be at least 12 characters"},400);
  try{
   const client=authClient();
   const {data,error}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
   if(error||!data.session||!await approvedViewer(data.session.access_token))return viewerResponse({error:"Invitation is not approved"},403);
   const updated=await client.auth.updateUser({password:newPassword});
   if(updated.error)return viewerResponse({error:"Unable to set password"},503);
   return setViewerCookie(viewerResponse({authenticated:true}),data.session.access_token,data.session.expires_in);
  }catch{return viewerResponse({error:"Invitation setup failed"},503);}
 }
 if(body?.action==="logout"){
  const res=viewerResponse({success:true});res.cookies.set(VIEWER_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return res;
 }
 const email=String(body?.email||"").trim().toLowerCase(),password=body?.password;
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||typeof password!=="string"||password.length>1024)return viewerResponse({error:"Invalid credentials"},400);
 try{
  const {data,error}=await authClient().auth.signInWithPassword({email,password});
  if(error||!data.session||!await approvedViewer(data.session.access_token))return viewerResponse({error:"Sign-in failed or access not approved"},403);
  return setViewerCookie(viewerResponse({authenticated:true}),data.session.access_token,data.session.expires_in);
 }catch{return viewerResponse({error:"Sign-in unavailable"},503);}
}
