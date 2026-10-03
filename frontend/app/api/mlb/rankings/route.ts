import { NextResponse } from "next/server";
import { getRankings } from "@/lib/mlb-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CacheEntry = {
  at: number;
  payload: any;
};

const g = globalThis as typeof globalThis & {
  __sachMlbRankingsRouteCache?: CacheEntry;
  __sachMlbRankingsRouteInflight?: Promise<any> | null;
};

const FRESH_MS = 60_000;
const STALE_MS = 10 * 60_000;

async function build() {
  const payload = await getRankings();
  g.__sachMlbRankingsRouteCache = {
    at: Date.now(),
    payload,
  };
  return payload;
}

export async function GET() {
  const cached = g.__sachMlbRankingsRouteCache;
  const age = cached ? Date.now() - cached.at : Infinity;

  // Fast path: category changes should not rebuild the full MLB ranking engine.
  if (cached && age < FRESH_MS) {
    return NextResponse.json(
      {
        success: true,
        ...cached.payload,
        routeCached: true,
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  }

  // Serve a recent snapshot immediately and refresh it in the background.
  if (cached && age < STALE_MS) {
    if (!g.__sachMlbRankingsRouteInflight) {
      g.__sachMlbRankingsRouteInflight = build()
        .catch(() => cached.payload)
        .finally(() => {
          g.__sachMlbRankingsRouteInflight = null;
        });
    }

    return NextResponse.json(
      {
        success: true,
        ...cached.payload,
        routeCached: true,
        refreshing: true,
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=15, stale-while-revalidate=120",
        },
      }
    );
  }

  // Cold start: dedupe simultaneous requests so multiple ranking categories
  // do not each trigger the expensive MLB build at the same time.
  if (!g.__sachMlbRankingsRouteInflight) {
    g.__sachMlbRankingsRouteInflight = build().finally(() => {
      g.__sachMlbRankingsRouteInflight = null;
    });
  }

  try {
    const payload = await g.__sachMlbRankingsRouteInflight;

    return NextResponse.json(
      {
        success: true,
        ...payload,
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    if (cached) {
      return NextResponse.json(
        {
          success: true,
          ...cached.payload,
          routeCached: true,
          stale: true,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        batter: {},
        pitcher: {},
        error:
          error instanceof Error
            ? error.message
            : "MLB rankings unavailable",
      },
      { status: 503 }
    );
  }
}
