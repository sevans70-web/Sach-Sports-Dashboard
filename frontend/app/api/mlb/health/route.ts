import { NextResponse } from "next/server";
import { connectionStatus, getSourceSnapshot } from "@/lib/mlb-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = connectionStatus();
  const ranking = config.supabaseConfigured
    ? await getSourceSnapshot("mlb_game_intelligence")
    : null;

  return NextResponse.json({
    success: config.mlbStatsConfigured && config.supabaseConfigured,
    ...config,
    rankingsReadable: Boolean(ranking?.connected && ranking?.row),
    latestRankingDate: ranking?.row?.game_date || null,
    latestRankingAt: ranking?.row?.created_at || null,
    error:
      ranking?.error ||
      (!config.supabaseConfigured ? "Supabase variables missing" : ""),
  });
}
