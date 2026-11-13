import { NextRequest } from "next/server";
import { adminJson, authClient, currentAdmin, mutationAllowed } from "@/lib/admin-auth";
export const dynamic="force-dynamic";
export async function GET(){
 if(!await currentAdmin())return adminJson({error:"Admin required"},401);
 const {data,error}=await authClient().from("dashboard_viewer_access").select("user_id,email,status,invited_at,updated_at").order("invited_at",{ascending:false});
 return error?adminJson({error:"Unable to list viewers"},503):adminJson({viewers:data});
}
export async function POST(req:NextRequest){
 if(!await currentAdmin())return adminJson({error:"Admin required"},401);
 if(!mutationAllowed(req))return adminJson({error:"Invalid origin"},403);
 if(Number(req.headers.get("content-length")||0)>4096)return adminJson({error:"Request too large"},413);
 const body=await req.json().catch(()=>null),action=String(body?.action||"");
 const client=authClient();
 if(action==="invite"){
  const email=String(body.email||"").trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254)return adminJson({error:"Valid email required"},400);
  // Invitation email sends a one-time setup link. Do not create an unrestricted signup.
  const {data,error}=await client.auth.admin.inviteUserByEmail(email,{redirectTo:"https://sach-sports-cloudflare-test.sevans70.workers.dev/viewer/login"});
  if(error||!data.user)return adminJson({error:error?.message||"Invitation failed"},502);
  const {error:saveError}=await client.from("dashboard_viewer_access").upsert({user_id:data.user.id,email,status:"approved",updated_at:new Date().toISOString()},{onConflict:"user_id"});
  if(saveError)return adminJson({error:"Invitation sent but approval record failed; access remains blocked"},503);
  return adminJson({success:true,email});
 }
 if(action==="status"){
  const userId=String(body.userId||""),status=String(body.status||"");
  if(!/^[0-9a-f-]{36}$/i.test(userId)||!["approved","suspended"].includes(status))return adminJson({error:"Invalid request"},400);
  const {data,error}=await client.from("dashboard_viewer_access").update({status,updated_at:new Date().toISOString()}).eq("user_id",userId).select("user_id").maybeSingle();
  return error||!data?adminJson({error:"Update failed"},404):adminJson({success:true});
 }
 return adminJson({error:"Unsupported action"},400);
}
