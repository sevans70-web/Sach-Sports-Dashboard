import {NextResponse} from "next/server";
import {captureAllWnbaMarkets} from "@/lib/wnba-rankings-server";

export const dynamic="force-dynamic";
export const revalidate=0;

async function capture(){
 try{return NextResponse.json(await captureAllWnbaMarkets(),{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}})}
 catch(e:any){return NextResponse.json({success:false,error:String(e?.message||e),markets:[],updatedAt:new Date().toISOString()},{status:500,headers:{"Cache-Control":"no-store"}})}
}
export async function GET(){return capture()}
export async function POST(){return capture()}
