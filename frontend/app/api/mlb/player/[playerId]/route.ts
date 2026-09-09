import { NextResponse } from "next/server";
import { getPlayer } from "@/lib/mlb-server";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ playerId: string }> }) {
  try { const { playerId } = await context.params; return NextResponse.json({ success: true, ...(await getPlayer(playerId)) }); }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Player unavailable" }, { status: 502 }); }
}
