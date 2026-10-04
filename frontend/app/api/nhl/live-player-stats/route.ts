import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function text(value: any) {
  return value == null ? "" : String(value);
}

function num(value: any) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("gameId") || "";

  if (!gameId) {
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
    const rows: any[] = [];

    for (const side of ["away", "home"] as const) {
      const team = payload?.[`${side}Team`] || {};
      const groups = payload?.playerByGameStats?.[side] || {};

      for (const bucket of ["forwards", "defense", "goalies"]) {
        for (const row of groups?.[bucket] || []) {
          const playerId = text(row?.playerId);
          if (!playerId) continue;

          const playerName =
            text(row?.name?.default) ||
            [
              text(row?.firstName?.default),
              text(row?.lastName?.default),
            ]
              .filter(Boolean)
              .join(" ") ||
            "Player";

          const saves =
            num(row?.saves) ??
            (
              num(row?.shotsAgainst) != null &&
              num(row?.goalsAgainst) != null
                ? Number(row.shotsAgainst) - Number(row.goalsAgainst)
                : null
            );

          rows.push({
            playerId,
            playerName,
            teamAbbr: text(team?.abbrev),
            side,
            stats: {
              shots_on_goal: num(row?.sog),
              goals: num(row?.goals),
              assists: num(row?.assists),
              points:
                num(row?.points) ??
                (
                  num(row?.goals) != null &&
                  num(row?.assists) != null
                    ? Number(row.goals) + Number(row.assists)
                    : null
                ),
              blocked_shots:
                num(row?.blockedShots) ??
                num(row?.blocked),
              goalie_saves: saves,
            },
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        gameId,
        rows,
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
