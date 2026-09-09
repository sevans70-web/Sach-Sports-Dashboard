import { NextResponse } from "next/server";
import { getGameFeed } from "@/lib/mlb-server";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ gamePk: string }> }) {
  try { const { gamePk } = await context.params; return NextResponse.json({ success: true, game: await getGameFeed(gamePk) }); }
  catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Game feed unavailable" }, { status: 502 }); }
}
