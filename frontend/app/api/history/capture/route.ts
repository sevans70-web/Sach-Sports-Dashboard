import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { NFL_MARKETS } from "@/lib/nfl";
import { CFB_MARKETS } from "@/lib/cfb";
import { BATTER_MARKETS, PITCHER_MARKETS } from "@/lib/mlb";
import {
  appendHistorySnapshot,
  historyArchiveStatus,
  torontoHistoryDay,
} from "@/lib/history-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROOT = process.env.SACH_HISTORY_DIR || "/data/sach-history";
const SYSTEM_DIR = path.join(ROOT, "_system");
const MANIFEST_FILE = path.join(SYSTEM_DIR, "last-capture.json");

const SPORTS = ["mlb", "nfl", "cfb", "nba", "wnba", "nhl", "soccer", "cbb"] as const;
type Sport = (typeof SPORTS)[number];

type FetchResult = {
  ok: boolean;
  status: number;
  payload: any;
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

async function fetchJson(
  origin: string,
  route: string,
  timeoutMs = 90_000,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${origin}${route}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "x-sach-history-capture": "1" },
    });

    const payload = await response.json().catch(() => null);
    const payloadFailed = payload?.success === false;

    return {
      ok: response.ok && !payloadFailed,
      status: response.status,
      payload,
      error: payloadFailed ? String(payload?.error || "capture returned success=false") : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function captureArchive(
  origin: string,
  sport: string,
  stream: string,
  route: string,
  day: string,
): Promise<CaptureResult> {
  const result = await fetchJson(origin, route);

  if (!result.ok) {
    return {
      sport,
      stream,
      path: route,
      ok: false,
      status: result.status,
      error: result.error,
    };
  }

  const saved = await appendHistorySnapshot(sport, stream, result.payload, day);

  return {
    sport,
    stream,
    path: route,
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

  // Small batches keep the provider/API load under control.
  for (let index = 0; index < markets.length; index += 3) {
    const batch = markets.slice(index, index + 3);

    const results = await Promise.all(
      batch.map((market: any) => {
        const marketName = String(market[0]);
        return captureArchive(
          origin,
          sport,
          marketName,
          `${base}?market=${encodeURIComponent(marketName)}`,
          day,
        );
      }),
    );

    output.push(...results);
  }

  return output;
}

async function directCapture(
  origin: string,
  sport: Sport,
  route: string,
  day: string,
) {
  const result = await fetchJson(origin, route, 120_000);

  if (result.ok) {
    await appendHistorySnapshot(
      sport,
      "capture_manifest",
      result.payload,
      day,
    );
  }

  return {
    sport,
    stream: "durable_capture",
    path: route,
    ok: result.ok,
    status: result.status,
    error: result.error,
  } satisfies CaptureResult;
}

function gradingRoutes(sport: Sport, deep: boolean) {
  const period = deep ? "Month" : "Week";

  switch (sport) {
    case "mlb":
      return ["/api/mlb/performance"];

    case "nfl":
      return [
        `/api/nfl/performance?period=${period}&group=QB`,
        `/api/nfl/performance?period=${period}&group=Offense`,
        `/api/nfl/performance?period=${period}&group=Q1`,
      ];

    case "cfb":
      return [
        `/api/cfb/performance?period=${period}&group=QB`,
        `/api/cfb/performance?period=${period}&group=Offense`,
      ];

    case "nba":
      return [`/api/nba/performance?period=${period}`];

    case "wnba":
      return [`/api/wnba/performance?period=${period}`];

    case "nhl":
      return [`/api/nhl/performance?period=${period}`];

    case "cbb":
      return [`/api/cbb/performance?period=${period}`];

    case "soccer":
      return [];
  }
}

async function captureSport(
  origin: string,
  sport: Sport,
  day: string,
  deep: boolean,
) {
  const results: CaptureResult[] = [];

  if (sport === "nfl") {
    results.push(
      ...(await marketSet(origin, sport, "/api/nfl/rankings", NFL_MARKETS, day)),
    );
  } else if (sport === "cfb") {
    results.push(
      ...(await marketSet(origin, sport, "/api/cfb/rankings", CFB_MARKETS, day)),
    );
  } else if (sport === "mlb") {
    results.push(
      ...(await marketSet(
        origin,
        sport,
        "/api/mlb/rankings",
        [...BATTER_MARKETS, ...PITCHER_MARKETS],
        day,
      )),
    );
  } else if (sport === "nba") {
    results.push(await directCapture(origin, sport, "/api/nba/capture", day));
  } else if (sport === "wnba") {
    results.push(await directCapture(origin, sport, "/api/wnba/capture", day));
  } else if (sport === "nhl") {
    results.push(await directCapture(origin, sport, "/api/nhl/capture", day));
  } else if (sport === "cbb") {
    results.push(await directCapture(origin, sport, "/api/cbb/capture", day));
  } else if (sport === "soccer") {
    results.push(
      await captureArchive(
        origin,
        sport,
        "dashboard",
        "/api/soccer/dashboard",
        day,
      ),
    );
  }

  const grading: CaptureResult[] = [];

  for (const route of gradingRoutes(sport, deep)) {
    const result = await fetchJson(origin, route, 180_000);

    grading.push({
      sport,
      stream: "grading",
      path: route,
      ok: result.ok,
      status: result.status,
      error: result.error,
    });
  }

  return [...results, ...grading];
}

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8"));
  } catch {
    return { sports: {} };
  }
}

async function writeManifest(sport: Sport, day: string, results: CaptureResult[]) {
  try {
    await fs.mkdir(SYSTEM_DIR, { recursive: true });

    const manifest = await readManifest();
    manifest.updatedAt = new Date().toISOString();
    manifest.day = day;
    manifest.sports = manifest.sports || {};
    manifest.sports[sport] = {
      updatedAt: new Date().toISOString(),
      success: results.every((item) => item.ok),
      saved: results.filter((item) => item.ok && item.stream !== "grading").length,
      failed: results.filter((item) => !item.ok).length,
      results,
    };

    const temp = `${MANIFEST_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(manifest, null, 2), "utf8");
    await fs.rename(temp, MANIFEST_FILE);
  } catch (error) {
    console.error(
      "[sach-history] manifest write failed",
      error instanceof Error ? error.message : String(error),
    );
  }
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
  const requestedSport = req.nextUrl.searchParams.get("sport");
  const deep = req.nextUrl.searchParams.get("deep") === "1";

  const selected = requestedSport
    ? SPORTS.filter((sport) => sport === requestedSport)
    : [...SPORTS];

  if (!selected.length) {
    return NextResponse.json(
      { success: false, error: `Unknown sport: ${requestedSport}` },
      { status: 400 },
    );
  }

  const allResults: CaptureResult[] = [];

  for (const sport of selected) {
    const results = await captureSport(origin, sport, day, deep);
    allResults.push(...results);
    await writeManifest(sport, day, results);
  }

  const failed = allResults.filter((result) => !result.ok);
  const saved = allResults.filter(
    (result) => result.ok && result.stream !== "grading",
  ).length;

  return NextResponse.json(
    {
      success: failed.length === 0,
      storage,
      day,
      sports: selected,
      saved,
      failed: failed.length,
      results: allResults,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}

export async function POST(req: NextRequest) {
  return GET(req);
}
