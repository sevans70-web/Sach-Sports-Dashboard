import { NextResponse } from "next/server";
import { getSchedule } from "@/lib/mlb-server";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ success: true, ...(await getSchedule()) }); }
  catch (error) { return NextResponse.json({ success: false, games: [], error: error instanceof Error ? error.message : "Schedule unavailable" }, { status: 502 }); }
}
