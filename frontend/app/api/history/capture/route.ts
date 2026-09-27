import { NextRequest, NextResponse } from "next/server";
import { NFL_MARKETS } from "@/lib/nfl";
import { CFB_MARKETS } from "@/lib/cfb";
import { NBA_MARKETS } from "@/lib/nba";
import { WNBA_MARKETS } from "@/lib/wnba";
import { NHL_MARKETS } from "@/lib/nhl";
import { CBB_MARKETS } from "@/lib/cbb";
import { BATTER_MARKETS, PITCHER_MARKETS } from "@/lib/mlb";
import {
  appendHistorySnapshot,
  historyArchiveStatus,
  torontoHistoryDay,
} from "@/lib/history-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type FetchResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  error?: string;
};

type CaptureResult = {
  sport: string;
  stream: string;
  path: string;
  ok: boolean;
  status?: number;
  error?: string;
  written?: boolean;
  count?: number;
};

async function fetchJson(origin: string, path: string): Promise<FetchResult> {
  try {
    const response = await fetch(`${origin}${path}`, {
      cache: "no-store",
      headers: { "x-sach-history-capture": "1" },
    });

    const payload = await response.json().catch(() => null);

    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function capture(
  origin: string,
  sport: string,
  stream: string,
  path: string,
  day: string,
): Promise<CaptureResult> {
  const result = await fetchJson(origin, path);

  if (!result.ok) {
    return {
      sport,
      stream,
      path,
      ok: false,
      status: result.status,
      error: result.error,
    };
  }

  const saved = await appendHistorySnapshot(sport, stream, result.payload, day);

  return {
    sport,
    stream,
    path,
    ok: true,
    written: saved.written,
    count: saved.count,
  };
}

async function marketSet(
  origin: string,
  sport: string,
  base: string,
  markets: readonly any[],
  day: string,
): Promise<CaptureResult[]> {
  const output: CaptureResult[] = [];

  for (let index = 0; index < markets.length; index += 4) {
    const batch = markets.slice(index, index + 4);
    const batchResults = await Promise.all(
      batch.map((market: any) => {
        const marketName = String(market[0]);
        return capture(
          origin,
          sport,
          marketName,
          `${base}?market=${encodeURIComponent(marketName)}`,
          day,
        );
      }),
    );

    output.push(...batchResults);
  }

  return output;
}

export async function GET(req: NextRequest) {
  const storage = await historyArchiveStatus();

  if (!storage.ok) {
    return NextResponse.json(
      { success: false, storage },
      { status: 503 },
    );
  }

  const origin = req.nextUrl.origin;
  const day = torontoHistoryDay();
  const results: CaptureResult[] = [];

  results.push(
    ...(await marketSet(origin, "nfl", "/api/nfl/rankings", NFL_MARKETS, day)),
  );
  results.push(
    ...(await marketSet(origin, "cfb", "/api/cfb/rankings", CFB_MARKETS, day)),
  );
  results.push(
    ...(await marketSet(origin, "nba", "/api/nba/rankings", NBA_MARKETS, day)),
  );
  results.push(
    ...(await marketSet(origin, "wnba", "/api/wnba/rankings", WNBA_MARKETS, day)),
  );
  results.push(
    ...(await marketSet(origin, "nhl", "/api/nhl/rankings", NHL_MARKETS, day)),
  );
  results.push(
    ...(await marketSet(origin, "cbb", "/api/cbb/rankings", CBB_MARKETS, day)),
  );
  results.push(
    ...(await marketSet(
      origin,
      "mlb",
      "/api/mlb/rankings",
      [...BATTER_MARKETS, ...PITCHER_MARKETS],
      day,
    )),
  );

  // Soccer currently exposes one dashboard payload rather than one rankings
  // endpoint per market, so archive that complete payload as one stream.
  results.push(
    await capture(origin, "soccer", "dashboard", "/api/soccer/dashboard", day),
  );

  const failed = results.filter((result) => !result.ok);

  return NextResponse.json(
    {
      success: failed.length === 0,
      storage,
      day,
      captured: results.length,
      failed: failed.length,
      results,
      updatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  return GET(req);
}
