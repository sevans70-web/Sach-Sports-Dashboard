import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS} from "@/lib/cfb";
import {NFL_MARKETS} from "@/lib/nfl";
import {captureAllWnbaMarkets} from "@/lib/wnba-rankings-server";
import {durableHistoryStatus} from "@/lib/durable-history";
export const dynamic="force-dynamic"; export const revalidate=0;
async function hit(origin:string,path:string){try{const r=await fetch(`${origin}${path}`,{cache:"no-store"});return {path,ok:r.ok,status:r.status}}catch(e){return {path,ok:false,status:0,error:e instanceof Error?e.message:String(e)}}}
async function batches<T>(items:T[],size:number,fn:(x:T)=>Promise<any>){const out:any[]=[];for(let i=0;i<items.length;i+=size)out.push(...await Promise.all(items.slice(i,i+size).map(fn)));return out}
export async function GET(req:NextRequest){
 const storage=await durableHistoryStatus(); if(!storage.ok)return NextResponse.json({success:false,storage},{status:503});
 const origin=req.nextUrl.origin;
 const cfb=await batches(CFB_MARKETS.map(x=>x[0]),4,m=>hit(origin,`/api/cfb/rankings?market=${encodeURIComponent(m)}`));
 const nfl=await batches(NFL_MARKETS.map(x=>x[0]),4,m=>hit(origin,`/api/nfl/rankings?market=${encodeURIComponent(m)}`));
 const wnba=await captureAllWnbaMarkets().catch(e=>({success:false,error:e instanceof Error?e.message:String(e)}));
 return NextResponse.json({success:true,storage,cfb,nfl,wnba,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:NextRequest){return GET(req)}
