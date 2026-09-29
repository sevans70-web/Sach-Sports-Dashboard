import {NextResponse} from "next/server";
import {captureAllNhlMarkets} from "@/lib/nhl-rankings-server";
export const dynamic="force-dynamic";export const revalidate=0;
async function run(){try{return NextResponse.json(await captureAllNhlMarkets(),{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}})}catch(e){return NextResponse.json({success:false,error:e instanceof Error?e.message:String(e)},{status:500,headers:{"Cache-Control":"no-store"}})}}
export async function GET(){return run()} export async function POST(){return run()}
