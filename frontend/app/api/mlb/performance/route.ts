import { NextResponse } from "next/server";
import { getPerformance } from "@/lib/mlb-server";
import { torontoDay, upsertSourceSnapshot } from "@/lib/prediction-storage";
import { mergeRailwayMlbHistory } from "@/lib/mlb-history-recovery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function buildResponse() {
  const original: any = await getPerformance();
  const recovered = await mergeRailwayMlbHistory(original);
  const data = recovered.data;
  const today = torontoDay(new Date());

  // Keep the existing Supabase copy when it is available, but Railway volume
  // history is now the durable source used to repair/serve missing dates.
  const writes = await Promise.all([
    upsertSourceSnapshot(
      "mlb_batter_performance_history",
      today,
      data.batter,
    ),
    upsertSourceSnapshot(
      "mlb_pitcher_performance_history",
      today,
      data.pitcher,
    ),
    upsertSourceSnapshot(
      "mlb_emerging_power_history",
      today,
      data.emerging,
    ),
  ]);

  return NextResponse.json(
    {
      success: true,
      ...data,
      lifecyclePersistence: {
        saved: writes.every((result) => result.ok),
        batter: writes[0].ok,
        pitcher: writes[1].ok,
        emerging: writes[2].ok,
        errors: writes
          .map((result) => result.error)
          .filter(Boolean),
        railwayLocal: true,
        availableDays: recovered.availableDays,
        localRecovered: recovered.localRecovered,
        archiveRecovered: recovered.archiveRecovered,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}

const performanceState=globalThis as typeof globalThis&{__mlbPerformanceCache?:{at:number,payload:any},__mlbPerformancePending?:Promise<any>};
export async function GET(){
 const cached=performanceState.__mlbPerformanceCache;
 if(cached&&Date.now()-cached.at<30_000)return NextResponse.json(cached.payload,{headers:{"Cache-Control":"no-store"}});
 let work=performanceState.__mlbPerformancePending;
 if(!work){
  work=buildResponse().then(r=>r.json()).then(payload=>{if(payload.connected!==false)performanceState.__mlbPerformanceCache={at:Date.now(),payload};return payload}).finally(()=>{delete performanceState.__mlbPerformancePending});
  performanceState.__mlbPerformancePending=work;
 }
 return NextResponse.json(await work,{headers:{"Cache-Control":"no-store"}});
}
