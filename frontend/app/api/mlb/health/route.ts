import { NextResponse } from "next/server";
import { connectionStatus, getMlbDiagnostics, getSourceSnapshot } from "@/lib/mlb-server";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = connectionStatus();
  const ranking = config.supabaseConfigured ? await getSourceSnapshot("mlb_game_intelligence") : null;
  let diagnostics:any=null;
  try { diagnostics=await getMlbDiagnostics(); } catch(error) { diagnostics={error:error instanceof Error?error.message:"MLB diagnostics failed"}; }
  return NextResponse.json({
    success: config.mlbStatsConfigured && config.supabaseConfigured,
    ...config,
    rankingsReadable: Boolean(ranking?.connected && ranking?.row),
    latestRankingDate: ranking?.row?.game_date || null,
    latestRankingAt: ranking?.row?.created_at || null,
    diagnostics,
    error: ranking?.error || (!config.supabaseConfigured ? "Supabase variables missing" : ""),
  });
}
