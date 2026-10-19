import { NextRequest } from "next/server";
import { adminJson, currentAdmin } from "@/lib/admin-auth";
import { ADMIN_SPORTS, adminResult, adminResultCounts } from "@/lib/admin-policy";
import { GET as nflPerformance } from "@/app/api/nfl/performance/route";
import { GET as cfbPerformance } from "@/app/api/cfb/performance/route";
import { GET as nbaPerformance } from "@/app/api/nba/performance/route";
import { GET as wnbaPerformance } from "@/app/api/wnba/performance/route";
import { GET as nhlPerformance } from "@/app/api/nhl/performance/route";
import { GET as cbbPerformance } from "@/app/api/cbb/performance/route";
import { getNflPredictions } from "@/lib/nfl-history";
import { getCfbPredictions } from "@/lib/cfb-history";
import { getNbaPredictions } from "@/lib/nba-history";
import { getWnbaPredictions } from "@/lib/wnba-history";
import { getNhlPredictions } from "@/lib/nhl-history";
import { getCbbPredictions } from "@/lib/cbb-history";
import { NFL_MARKETS } from "@/lib/nfl";
import { CFB_MARKETS } from "@/lib/cfb";
import { NBA_MARKETS } from "@/lib/nba";
import { WNBA_MARKETS } from "@/lib/wnba";
import { NHL_MARKETS } from "@/lib/nhl";
import { CBB_MARKETS } from "@/lib/cbb";
import { dashboardDay } from "@/lib/dashboard-contract";
import { guardPerformancePayload } from "@/lib/prop-integrity";
import { enrichRecordAvailability } from "@/lib/record-notes-server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  if (!await currentAdmin()) return adminJson({ error: "Administrator sign-in required." }, 401);
  const sport = req.nextUrl.searchParams.get("sport") || "nfl", period = req.nextUrl.searchParams.get("period") || "Today";
  if (!(ADMIN_SPORTS as readonly string[]).includes(sport) || !["Today", "Yesterday", "Week"].includes(period)) return adminJson({ error: "Unsupported sport or period." }, 400);
  try {
    const handler = { nfl: nflPerformance, cfb: cfbPerformance, nba: nbaPerformance, wnba: wnbaPerformance, nhl: nhlPerformance, cbb: cbbPerformance }[sport]!;
    const groups = sport === "nfl" ? ["QB", "Offense", "Q1"] : sport === "cfb" ? ["QB", "Offense"] : [""];
    await Promise.all(groups.map(async group => {
      const url = new URL(`/api/${sport}/performance`, req.url); url.searchParams.set("period", period); if (group) url.searchParams.set("group", group);
      const response = await handler(new NextRequest(url));
      const payload = await response.json();
      if (!response.ok || payload.success === false || payload.connected === false) throw new Error("Result history is temporarily unavailable.");
      return payload;
    }));
    // Public history responses can be capped at 100 entries. Inspect the full
    // saved scope after settlement, rather than silently truncating the audit.
    const reader = { nfl: getNflPredictions, cfb: getCfbPredictions, nba: getNbaPredictions, wnba: getWnbaPredictions, nhl: getNhlPredictions, cbb: getCbbPredictions }[sport] as (market: any, day: string) => Promise<any>;
    const definitions = { nfl: NFL_MARKETS, cfb: CFB_MARKETS, nba: NBA_MARKETS, wnba: WNBA_MARKETS, nhl: NHL_MARKETS, cbb: CBB_MARKETS }[sport]!;
    const days = Array.from({ length: period === "Week" ? 7 : 1 }, (_, i) => dashboardDay(new Date(Date.now() - (i + (period === "Yesterday" ? 1 : 0)) * 86400000)));
    const batches = await Promise.all(days.flatMap(day => definitions.map(([market]) => reader(market, day))));
    if (batches.some(batch => batch.connected === false)) throw new Error("Incomplete history");
    const guarded = guardPerformancePayload({ predictions: batches.flatMap(batch => batch.predictions || []) }, sport);
    const withNotes=await enrichRecordAvailability(guarded.predictions,sport);
    const records = withNotes.map(adminResult) as ReturnType<typeof adminResult>[];
    records.sort((a, b) => String(b.gameTime || b.savedAt || "").localeCompare(String(a.gameTime || a.savedAt || ""))) ;
    return adminJson({ sport, period, records, counts: adminResultCounts(records), updatedAt: new Date().toISOString() });
  } catch { return adminJson({ error: "Could not load complete result history. Retry shortly; partial counts are not displayed." }, 502); }
}
