import { NextResponse } from "next/server";
import { getPerformance } from "@/lib/mlb-server";
import { torontoDay, upsertSourceSnapshot } from "@/lib/prediction-storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getPerformance();
  const day = torontoDay();

  // Lifecycle safety net: persist the same histories returned to the dashboard.
  // This fixes cases where the older MLB writer silently fails because Railway
  // is using a new-format Supabase secret key.
  const writes = await Promise.all([
    upsertSourceSnapshot("mlb_batter_performance_history", day, data.batter),
    upsertSourceSnapshot("mlb_pitcher_performance_history", day, data.pitcher),
    upsertSourceSnapshot("mlb_emerging_power_history", day, data.emerging),
  ]);

  return NextResponse.json({
    success: true,
    ...data,
    lifecyclePersistence: {
      saved: writes.every(x => x.ok),
      batter: writes[0].ok,
      pitcher: writes[1].ok,
      emerging: writes[2].ok,
      errors: writes.map(x => x.error).filter(Boolean),
    },
  }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
}
