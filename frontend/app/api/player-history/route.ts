import {retainPlayerHistory} from '@/lib/player-history-cloud';
import {providerFetch as fetch} from "@/lib/provider-fetch";
import { NextRequest, NextResponse } from "next/server";
import { extractStatisticsLogAppearances } from "@/lib/soccer-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MLB_PITCHER_MARKETS = new Set([
  "strikeouts",
  "outs_recorded",
  "hits_allowed",
  "walks_allowed",
  "earned_runs",
]);

function finite(value: unknown) {
  if(value==null||typeof value==="boolean"||String(value).trim()==="")return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mlbValue(stat: any, market: string) {
  if (!stat) return null;

  if (market === "home_runs") return finite(stat.homeRuns);
  if (market === "hits") return finite(stat.hits);
  if (market === "total_bases") return finite(stat.totalBases);
  if (market === "runs") return finite(stat.runs);
  if (market === "rbis") return finite(stat.rbi);
  if (market === "walks") return finite(stat.baseOnBalls);
  if (market === "stolen_bases") return finite(stat.stolenBases);
  if (market === "batter_strikeouts") return finite(stat.strikeOuts);

  if (market === "strikeouts") return finite(stat.strikeOuts);
  if (market === "hits_allowed") return finite(stat.hits);
  if (market === "walks_allowed") return finite(stat.baseOnBalls);
  if (market === "earned_runs") return finite(stat.earnedRuns);

  if (market === "hits_runs_rbis") {
    return (
      [stat.hits,stat.runs,stat.rbi].every(v=>finite(v)!=null)?Number(stat.hits)+Number(stat.runs)+Number(stat.rbi):null
    );
  }

  if (market === "outs_recorded") {
    const raw = String(stat.inningsPitched ?? "");
    if (!raw) return null;

    const [whole, fraction = "0"] = raw.split(".");
    const innings = Number(whole);
    const extraOuts = Number(fraction);

    if (!Number.isInteger(innings) || !Number.isInteger(extraOuts) || extraOuts<0 || extraOuts>2) {
      return null;
    }

    return innings * 3 + Math.min(2, Math.max(0, extraOuts));
  }

  return null;
}

async function mlbHistory(playerId: string, market: string) {
  const group = MLB_PITCHER_MARKETS.has(market) ? "pitching" : "hitting";
  const rows: Array<{ date: string; value: number;gameId:string;opponent:string;season:number }> = [];

  await Promise.all(
    [2025, 2026].map(async (season) => {
      try {
        const url =
          `https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(playerId)}/stats` +
          `?stats=gameLog&group=${group}&season=${season}`;

        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;

        const payload = await response.json();

        for (const block of payload?.stats || []) {
          for (const split of block?.splits || []) {
            const value = mlbValue(split?.stat, market);
            if (value == null) continue;

            rows.push({
              date: String(split?.date || split?.game?.gameDate || ""),
              value,gameId:String(split?.game?.gamePk||""),opponent:String(split?.opponent?.name||""),season,
            });
          }
        }
      } catch {}
    })
  );

  return rows
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20);
}

function nhlValue(game: any, market: string) {
  if (market === "shots_on_goal") {
    return finite(game?.shots ?? game?.shotsOnGoal);
  }

  if (market === "points") {
    const direct = finite(game?.points);
    if (direct != null) return direct;
    return (finite(game?.goals) || 0) + (finite(game?.assists) || 0);
  }

  if (market === "goals") return finite(game?.goals);
  if (market === "assists") return finite(game?.assists);
  if (market === "blocked_shots") return finite(game?.blockedShots);
  if (market === "goalie_saves") return finite(game?.saves);

  return null;
}

async function nhlHistory(playerId: string, market: string) {
  const rows: Array<{ date: string; value: number;gameId:string;opponent:string;season:number }> = [];

  for (const season of [20252026, 20262027]) {
    try {
      const response = await fetch(
        `https://api-web.nhle.com/v1/player/${encodeURIComponent(playerId)}/game-log/${season}/2`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );

      if (!response.ok) continue;

      const payload = await response.json();

      for (const game of payload?.gameLog || []) {
        const value = nhlValue(game, market);
        if (value == null) continue;

        rows.push({
          date: String(game?.gameDate || ""),
          value,gameId:String(game?.gameId||""),opponent:String(game?.opponentCommonName?.default||game?.opponentAbbrev||""),season,
        });
      }
    } catch {}
  }

  return rows
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20);
}

async function soccerHistory(
  playerId: string,
  playerName: string,
  team: string,
  market: string,
  league: string
) {
  const response = await fetch(
    `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${encodeURIComponent(league)}/athletes/${encodeURIComponent(playerId)}/statisticslog?limit=40`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }
  );

  if (!response.ok) return [];

  const payload = await response.json();

  const rows = extractStatisticsLogAppearances(payload, {
    playerId,
    playerName,
    photoUrl: "",
    teamId: "",
    team,
    position: market === "saves" ? "GK" : "",
  });

  return rows.filter((row:any)=>row.availableMetrics?.includes(market)&&finite(row[market])!=null&&row.gameId&&row.gameDate).map((row:any)=>({gameId:String(row.gameId),date:row.gameDate,opponent:row.opponent||'',value:Number(row[market])})).slice(-20);
}

async function loadHistory(req: NextRequest) {
  const sport = String(
    req.nextUrl.searchParams.get("sport") || ""
  ).toLowerCase();

  const playerId = String(
    req.nextUrl.searchParams.get("playerId") || ""
  );

  const playerName = String(
    req.nextUrl.searchParams.get("playerName") || ""
  );

  const team = String(
    req.nextUrl.searchParams.get("team") || ""
  );

  const market = String(
    req.nextUrl.searchParams.get("market") || ""
  );

  const league = String(
    req.nextUrl.searchParams.get("league") || "eng.1"
  );

  if (!sport || !playerId || !market) {
    return NextResponse.json(
      {
        success: false,
        values: [],
        error: "Missing sport, playerId or market.",
      },
      { status: 400 }
    );
  }

  try {
    let points:any[] = [];

    if (sport === "mlb") {
      points = await mlbHistory(playerId, market);
    } else if (sport === "nhl") {
      points = await nhlHistory(playerId, market);
    } else if (sport === "soccer") {
      points = await soccerHistory(
        playerId,
        playerName,
        team,
        market,
        league
      );
    } else {
      return NextResponse.json(
        {
          success: false,
          sport,
          playerId,
          market,
          values: [],
          error: "This sport already uses its native player-history endpoint.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        sport,
        playerId,
        market,
        values:points.map(p=>p.value),
        points,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        sport,
        playerId,
        market,
        values: [],
        error:
          error instanceof Error
            ? error.message
            : "Player history unavailable.",
      },
      { status: 200 }
    );
  }
}

export async function GET(req:NextRequest){const response=await loadHistory(req);return retainPlayerHistory(req.nextUrl.searchParams.get('sport')||'',req.nextUrl.searchParams.get('playerId')||'',req.nextUrl.searchParams.get('market')||'',response,req.nextUrl.searchParams.get('before'));}
