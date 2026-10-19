import {nhlParticipation} from "@/lib/player-participation";
import {officialAvailabilityRows} from '@/lib/record-notes';
import {nhlObservedRows} from "@/lib/observed-player-stats";
import {providerFetch as fetch} from "@/lib/provider-fetch";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("gameId") || "";

  if (!/^\d+$/.test(gameId)) {
    return NextResponse.json(
      { success: false, rows: [], error: "Missing NHL gameId" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://api-web.nhle.com/v1/gamecenter/${encodeURIComponent(gameId)}/boxscore`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "Sach-Sports/1.0",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`NHL boxscore ${response.status}`);
    }

    const payload = await response.json();
    if(String(payload?.id||"")!==gameId)throw new Error("NHL boxscore game identity mismatch");
    const rows=nhlObservedRows(payload);

    return NextResponse.json(
      {
        success: true,
        gameId,
        rows,
        participants:nhlParticipation(payload),
        availability:officialAvailabilityRows(payload,'nhl',gameId),
        state: ["OFF","FINAL"].includes(String(payload.gameState))?"post":["LIVE","CRIT"].includes(String(payload.gameState))?"in":"pre",
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        gameId,
        rows: [],
        error:
          error instanceof Error
            ? error.message
            : "NHL live player stats unavailable",
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
