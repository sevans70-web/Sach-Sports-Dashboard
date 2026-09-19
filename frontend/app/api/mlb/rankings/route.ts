import {NextResponse} from "next/server";
import {getRankings,getSchedule} from "@/lib/mlb-server";
import {activeSlateDate,localDateKey,previousDateKey} from "@/lib/active-slate";
export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(){
  try{
    const today=localDateKey();
    const yesterday=previousDateKey(today);
    const previous=await getSchedule(yesterday).catch(()=>({games:[]} as any));
    const slateDate=activeSlateDate(previous.games||[]);
    const data=await getRankings(slateDate);
    return NextResponse.json({...data,activeSlateDate:slateDate,calendarDate:today});
  }catch(e){
    return NextResponse.json({success:false,error:e instanceof Error?e.message:"MLB rankings unavailable"},{status:500});
  }
}
