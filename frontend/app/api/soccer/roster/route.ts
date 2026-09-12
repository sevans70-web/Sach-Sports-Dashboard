import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ALLOWED = new Set([
  "eng.1",
  "usa.1",
  "uefa.champions",
  "esp.1",
  "ita.1",
  "ger.1",
  "fra.1",
]);

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "SachSportsDashboard/1.0" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") || "eng.1";
  const teamId = req.nextUrl.searchParams.get("teamId") || "";

  if (!ALLOWED.has(league) || !teamId) {
    return NextResponse.json(
      { success: false, teamId, teamName: "", players: [], error: "Missing team" },
      { status: 400 },
    );
  }

  try {
    const data = await fetchJson(`${ESPN_BASE}/${league}/teams/${teamId}/roster`);
    const teamName = String(
      data?.team?.displayName ||
      data?.team?.name ||
      data?.team?.shortDisplayName ||
      "",
    );

    const groups = Array.isArray(data?.athletes) ? data.athletes : [];
    const rawPlayers = groups.flatMap((group: any) => {
      if (Array.isArray(group?.items)) return group.items;
      if (Array.isArray(group?.athletes)) return group.athletes;
      if (group?.id || group?.displayName || group?.fullName) return [group];
      return [];
    });

    const players = rawPlayers
      .map((athlete: any) => ({
        playerId: String(athlete?.id || ""),
        playerName: String(
          athlete?.displayName || athlete?.fullName || athlete?.shortName || "Unknown",
        ),
        photoUrl: String(athlete?.headshot?.href || ""),
        position: String(
          athlete?.position?.abbreviation ||
          athlete?.position?.displayName ||
          athlete?.position?.name ||
          "",
        ),
        jersey: String(athlete?.jersey || ""),
      }))
      .filter((player: any) => player.playerName !== "Unknown")
      .sort((a: any, b: any) => {
        const order: Record<string, number> = {
          GK: 0,
          G: 0,
          D: 1,
          DF: 1,
          M: 2,
          MF: 2,
          F: 3,
          FW: 3,
        };
        return (order[a.position] ?? 9) - (order[b.position] ?? 9) ||
          a.playerName.localeCompare(b.playerName);
      });

    return NextResponse.json({
      success: true,
      teamId,
      teamName,
      players,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      teamId,
      teamName: "",
      players: [],
      error: `Roster unavailable (${error?.message || "source error"})`,
    });
  }
}
