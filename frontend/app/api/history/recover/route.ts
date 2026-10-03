import { NextRequest, NextResponse } from "next/server";
import { recoverHistoryFromArchives } from "@/lib/history-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const days = Math.min(
    370,
    Math.max(1, Number(req.nextUrl.searchParams.get("days") || 45)),
  );

  const sport = req.nextUrl.searchParams.get("sport");

  try {
    const result = await recoverHistoryFromArchives(days, sport);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
