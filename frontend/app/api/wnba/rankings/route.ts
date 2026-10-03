import { NextRequest, NextResponse } from "next/server";
import {
  type WnbaMarketKey,
  WNBA_MARKETS,
  loadWnbaOverview,
  playerBaseline,
  wnbaHeadshot,
} from "@/lib/wnba";
import { buildWnbaMarketRankings } from "@/lib/wnba-rankings-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const allowed = new Set(WNBA_MARKETS.map((x) => x[0]));

function torontoDay(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function nextActiveSlate(games: any[]) {
  const today = torontoDay(new Date());

  const todayGames = games
    .filter((game) => {
      const gameDay = game?.tipoff ? torontoDay(game.tipoff) : "";
      return gameDay === today && game?.state !== "post";
    })
    .sort(
      (a, b) =>
        new Date(a.tipoff || 0).getTime() -
        new Date(b.tipoff || 0).getTime()
    );

  if (todayGames.length) return todayGames;

  const future = games
    .filter(
      (game) =>
        game?.tipoff &&
        game?.state !== "post" &&
        new Date(game.tipoff).getTime() > Date.now()
    )
    .sort(
      (a, b) =>
        new Date(a.tipoff || 0).getTime() -
        new Date(b.tipoff || 0).getTime()
    );

  if (!future.length) return [];

  const nextDay = torontoDay(future[0].tipoff);
  return future.filter((game) => torontoDay(game.tipoff) === nextDay);
}

async function nextSlateFallback(market: WnbaMarketKey) {
  const overview = await loadWnbaOverview();
  const games = nextActiveSlate(overview.games || []);

  if (!games.length) return [];

  const activeTeams = new Set(
    games.flatMap((game: any) => [
      String(game.awayAbbr || "").toUpperCase(),
      String(game.homeAbbr || "").toUpperCase(),
    ])
  );

  const rows = (overview.players || [])
    .map((player: any) => {
      const team = String(player?.team || "").toUpperCase();
      if (!activeTeams.has(team)) return null;

      const baseline = playerBaseline(player, market);
      if (baseline == null) return null;

      const game = games.find((item: any) =>
        [item.awayAbbr, item.homeAbbr]
          .map((value: any) => String(value || "").toUpperCase())
          .includes(team)
      );

      if (!game) return null;

      const reliability = Math.min(
        1,
        Math.max(0, Number(player?.gamesPlayed || 0) / 30)
      );

      return {
        playerId: player.playerId,
        playerName: player.playerName,
        teamName: player.team || "WNBA",
        teamLogo:
          String(game.awayAbbr || "").toUpperCase() === team
            ? game.awayLogo || ""
            : game.homeLogo || "",
        matchup: `${game.awayTeam} @ ${game.homeTeam}`,
        gameTime: game.tipoff || "",
        gameId: game.gameId || "",
        gameState: game.state || "pre",
        gameStatus: game.status || "Scheduled",
        headshot: wnbaHeadshot(player.playerId),
        sportsbookLine: null,
        bookmakerCount: 0,
        modelProjection: baseline,
        modelProbability: null,
        giScore: Math.round((50 + reliability * 15) * 10) / 10,
        prediction: null,
        marketBacked: false,
        summary:
          `Next-slate WNBA playoff candidate using the 2026 statistical baseline ` +
          `${baseline.toFixed(1)}. No verified sportsbook line is available yet, ` +
          `so this row is model-only and is not saved or graded as a sportsbook prediction.`,
      };
    })
    .filter(Boolean) as any[];

  return rows
    .sort(
      (a, b) =>
        Number(b.modelProjection || 0) -
          Number(a.modelProjection || 0) ||
        Number(b.giScore || 0) - Number(a.giScore || 0)
    )
    .slice(0, 25)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}

export async function GET(req: NextRequest) {
  const market = (
    req.nextUrl.searchParams.get("market") || "points"
  ) as WnbaMarketKey;

  if (!allowed.has(market)) {
    return NextResponse.json(
      {
        success: false,
        rows: [],
        error: "Unsupported WNBA market",
      },
      { status: 400 }
    );
  }

  try {
    const result = await buildWnbaMarketRankings(market);

    if (Array.isArray(result?.rows) && result.rows.length) {
      return NextResponse.json(result, {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, max-age=0",
        },
      });
    }

    const fallback = await nextSlateFallback(market);

    return NextResponse.json(
      {
        ...result,
        success: fallback.length > 0,
        rows: fallback,
        nextSlate: true,
        source: fallback.length
          ? "ESPN WNBA next slate + 2026 baseline"
          : result?.source || "WNBA",
        updatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (error) {
    const fallback = await nextSlateFallback(market).catch(() => []);

    return NextResponse.json(
      {
        success: fallback.length > 0,
        market,
        rows: fallback,
        nextSlate: true,
        source: fallback.length
          ? "ESPN WNBA next slate + 2026 baseline"
          : "WNBA",
        error:
          error instanceof Error
            ? error.message
            : "WNBA rankings unavailable",
        updatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
