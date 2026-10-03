import { NextRequest, NextResponse } from "next/server";
import { getGameFeed } from "@/lib/mlb-server";
import { loadNbaGameRosters } from "@/lib/nba";
import { loadCbbGameRosters } from "@/lib/cbb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SportKey =
  | "mlb"
  | "nfl"
  | "cfb"
  | "nba"
  | "wnba"
  | "nhl"
  | "soccer"
  | "cbb";

type RosterPlayer = {
  playerId: string;
  playerName: string;
  position: string;
  starter: boolean;
  active: boolean;
  headshot: string;
};

type Roster = {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  teamLogo: string;
  side: "away" | "home" | "";
  players: RosterPlayer[];
};

type InjuryRow = {
  teamName: string;
  playerName: string;
  position: string;
  status: string;
};

type RecentRow = {
  date: string;
  result: string;
};

type GameContext = {
  spread: string;
  total: number | null;
  weather: string;
  broadcast: string[];
  venue: string;
  provider: string;
};

const text = (value: any) =>
  value == null ? "" : String(value);

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "Sach-Sports/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Provider ${response.status}`);
  }

  return response.json();
}

function espnPath(
  sport: SportKey,
  league: string
) {
  if (sport === "nfl") return "football/nfl";
  if (sport === "cfb")
    return "football/college-football";
  if (sport === "nba") return "basketball/nba";
  if (sport === "wnba")
    return "basketball/wnba";
  if (sport === "cbb")
    return "basketball/mens-college-basketball";
  if (sport === "soccer")
    return `soccer/${encodeURIComponent(league)}`;

  return "";
}

function normalizeRosterPlayer(
  raw: any
): RosterPlayer | null {
  const athlete =
    raw?.athlete &&
    typeof raw.athlete === "object"
      ? raw.athlete
      : raw;

  const id = text(athlete?.id);

  if (!id) return null;

  return {
    playerId: id,
    playerName: text(
      athlete?.displayName ||
        athlete?.fullName ||
        "Player"
    ),
    position: text(
      athlete?.position?.abbreviation ||
        athlete?.position?.name ||
        ""
    ),
    starter: Boolean(
      raw?.starter ||
        raw?.battingOrder ||
        raw?.gamesStarted
    ),
    active:
      raw?.didNotPlay !== true &&
      text(
        athlete?.status?.type
      ).toLowerCase() !== "inactive",
    headshot: text(
      athlete?.headshot?.href ||
        athlete?.headshot ||
        ""
    ),
  };
}

function flattenRosterAthletes(payload: any) {
  const raw = Array.isArray(payload?.athletes)
    ? payload.athletes
    : [];

  const out: any[] = [];

  for (const item of raw) {
    const nested =
      item?.items || item?.athletes;

    if (
      Array.isArray(nested) &&
      nested.length
    ) {
      out.push(...nested);
    } else {
      out.push(item);
    }
  }

  return out;
}

function recordFromCompetitor(
  competitor: any
) {
  return text(
    competitor?.records?.[0]?.summary ||
      competitor?.record ||
      ""
  );
}

function parseInjuries(
  summary: any
): InjuryRow[] {
  const out: InjuryRow[] = [];

  for (const group of summary?.injuries || []) {
    const teamName = text(
      group?.team?.displayName ||
        group?.team?.name ||
        ""
    );

    const rows =
      group?.injuries ||
      group?.items ||
      [];

    for (const row of rows) {
      const athlete =
        row?.athlete || row?.player || {};

      out.push({
        teamName,
        playerName: text(
          athlete?.displayName ||
            athlete?.fullName ||
            row?.displayName ||
            "Player"
        ),
        position: text(
          athlete?.position?.abbreviation ||
            athlete?.position?.name ||
            ""
        ),
        status: text(
          row?.status ||
            row?.type?.description ||
            row?.type?.name ||
            row?.details?.type ||
            row?.details?.detail ||
            "Reported"
        ),
      });
    }
  }

  return out;
}

function parseSeasonSeries(
  summary: any
): RecentRow[] {
  const candidates = [
    ...(summary?.seasonseries || []),
    ...(summary?.seasonSeries || []),
    ...(summary?.headToHeadGames || []),
  ];

  const out: RecentRow[] = [];

  for (const item of candidates) {
    const event =
      item?.event || item;

    const competition =
      event?.competitions?.[0] || {};

    const competitors =
      competition?.competitors || [];

    const away =
      competitors.find(
        (entry: any) =>
          entry?.homeAway === "away"
      ) || {};

    const home =
      competitors.find(
        (entry: any) =>
          entry?.homeAway === "home"
      ) || {};

    const awayName = text(
      away?.team?.abbreviation ||
        away?.team?.shortDisplayName ||
        away?.team?.displayName
    );

    const homeName = text(
      home?.team?.abbreviation ||
        home?.team?.shortDisplayName ||
        home?.team?.displayName
    );

    if (!awayName || !homeName) continue;

    const awayScore = text(
      away?.score?.displayValue ??
        away?.score ??
        ""
    );

    const homeScore = text(
      home?.score?.displayValue ??
        home?.score ??
        ""
    );

    out.push({
      date: text(
        event?.date ||
          competition?.date ||
          ""
      )
        ? new Intl.DateTimeFormat(
            "en-US",
            {
              timeZone: "America/Toronto",
              month: "short",
              day: "numeric",
              year: "numeric",
            }
          ).format(
            new Date(
              event?.date ||
                competition?.date
            )
          )
        : "Recent",
      result:
        awayScore || homeScore
          ? `${awayName} ${awayScore || "—"} – ${homeName} ${homeScore || "—"}`
          : `${awayName} @ ${homeName}`,
    });
  }

  return out.slice(0, 5);
}

function espnContext(summary: any) {
  const competition =
    summary?.header?.competitions?.[0] ||
    {};

  const odds =
    (summary?.pickcenter || [])[0] || {};

  const weather =
    competition?.weather ||
    summary?.gameInfo?.weather ||
    {};

  return {
    spread: text(
      odds?.details ||
        odds?.spreadDetails ||
        ""
    ),
    total:
      odds?.overUnder == null
        ? null
        : Number(odds.overUnder),
    weather: text(
      weather?.displayValue ||
        weather?.conditionId ||
        ""
    ),
    broadcast: (
      competition?.broadcasts || []
    ).flatMap(
      (broadcast: any) =>
        broadcast?.names || []
    ),
    venue: text(
      competition?.venue?.fullName ||
        summary?.gameInfo?.venue?.fullName ||
        ""
    ),
    provider: text(
      odds?.provider?.name || ""
    ),
  } satisfies GameContext;
}

async function espnGameDetail(
  sport: Exclude<
    SportKey,
    "mlb" | "nhl"
  >,
  gameId: string,
  league: string
) {
  const path = espnPath(
    sport,
    league
  );

  if (!path) {
    return {
      rosters: [] as Roster[],
      context: {
        spread: "",
        total: null,
        weather: "",
        broadcast: [],
        venue: "",
        provider: "",
      } satisfies GameContext,
      injuries: [] as InjuryRow[],
      recentMatchups: [] as RecentRow[],
    };
  }

  const summary = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${encodeURIComponent(
      gameId
    )}`
  );

  const competition =
    summary?.header?.competitions?.[0] ||
    {};

  const competitors =
    Array.isArray(
      competition?.competitors
    )
      ? competition.competitors
      : [];

  const sideByTeam = new Map<
    string,
    "away" | "home" | ""
  >(
    competitors.map((entry: any) => [
      text(entry?.team?.id),
      entry?.homeAway === "away"
        ? "away"
        : entry?.homeAway === "home"
          ? "home"
          : "",
    ])
  );

  const boxGroups =
    Array.isArray(
      summary?.boxscore?.players
    )
      ? summary.boxscore.players
      : [];

  const rosters: Roster[] = [];

  for (const group of boxGroups) {
    const team = group?.team || {};
    const players: RosterPlayer[] = [];

    for (
      const statistic of
        group?.statistics || []
    ) {
      for (
        const row of
          statistic?.athletes || []
      ) {
        const player =
          normalizeRosterPlayer(row);

        if (player) {
          players.push(player);
        }
      }
    }

    const dedup = [
      ...new Map(
        players.map((player) => [
          player.playerId,
          player,
        ])
      ).values(),
    ].sort(
      (a, b) =>
        Number(b.starter) -
          Number(a.starter) ||
        a.playerName.localeCompare(
          b.playerName
        )
    );

    if (dedup.length) {
      rosters.push({
        teamId: text(team?.id),
        teamName: text(
          team?.displayName ||
            team?.name ||
            "Team"
        ),
        teamAbbr: text(
          team?.abbreviation || ""
        ),
        teamLogo: text(
          team?.logo || ""
        ),
        side:
          sideByTeam.get(
            text(team?.id)
          ) || "",
        players: dedup,
      });
    }
  }

  if (rosters.length < 2) {
    const teams = competitors
      .map(
        (entry: any) =>
          entry?.team || {}
      )
      .filter(
        (team: any) =>
          text(team?.id)
      );

    const fallback =
      await Promise.all(
        teams.map(
          async (
            team: any
          ): Promise<Roster | null> => {
            try {
              const payload =
                await fetchJson(
                  `https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${encodeURIComponent(
                    text(team?.id)
                  )}/roster`
                );

              const players =
                flattenRosterAthletes(
                  payload
                )
                  .map(
                    normalizeRosterPlayer
                  )
                  .filter(
                    (
                      player
                    ): player is RosterPlayer =>
                      Boolean(player)
                  )
                  .sort(
                    (a, b) =>
                      Number(
                        b.starter
                      ) -
                        Number(
                          a.starter
                        ) ||
                      a.playerName.localeCompare(
                        b.playerName
                      )
                  );

              return {
                teamId: text(
                  team?.id
                ),
                teamName: text(
                  team?.displayName ||
                    team?.name ||
                    payload?.team
                      ?.displayName ||
                    "Team"
                ),
                teamAbbr: text(
                  team?.abbreviation ||
                    payload?.team
                      ?.abbreviation ||
                    ""
                ),
                teamLogo: text(
                  team?.logo ||
                    payload?.team
                      ?.logo ||
                    ""
                ),
                side:
                  sideByTeam.get(
                    text(team?.id)
                  ) || "",
                players,
              };
            } catch {
              return null;
            }
          }
        )
      );

    for (const roster of fallback) {
      if (
        roster &&
        !rosters.some(
          (current) =>
            current.teamId ===
            roster.teamId
        )
      ) {
        rosters.push(roster);
      }
    }
  }

  return {
    rosters,
    context: espnContext(summary),
    injuries: parseInjuries(summary),
    recentMatchups:
      parseSeasonSeries(summary),
  };
}

async function mlbGameDetail(
  gamePk: string
) {
  const feed: any =
    await getGameFeed(gamePk);

  const teams =
    feed?.liveData?.boxscore?.teams ||
    {};

  const gameTeams =
    feed?.gameData?.teams ||
    {};

  const gamePlayers =
    feed?.gameData?.players || {};

  const rosters: Roster[] = [];

  for (
    const side of
      ["away", "home"] as const
  ) {
    const source =
      teams?.[side] || {};

    const team =
      gameTeams?.[side] || {};

    let players: RosterPlayer[] = (
      Object.values(
        source?.players || {}
      ) as any[]
    )
      .map((entry: any) => {
        const person =
          entry?.person || {};

        const id =
          text(person?.id);

        if (!id) return null;

        return {
          playerId: id,
          playerName: text(
            person?.fullName ||
              "Player"
          ),
          position: text(
            entry?.position
              ?.abbreviation ||
              entry?.position?.name ||
              ""
          ),
          starter: Boolean(
            entry?.battingOrder ||
              entry?.stats?.batting
                ?.gamesStarted
          ),
          active: true,
          headshot:
            `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${id}/headshot/67/current`,
        } as RosterPlayer;
      })
      .filter(
        (
          player
        ): player is RosterPlayer =>
          Boolean(player)
      );

    if (!players.length) {
      const teamId =
        Number(team?.id || 0);

      players = (
        Object.values(
          gamePlayers
        ) as any[]
      )
        .filter(
          (entry: any) =>
            Number(
              entry?.currentTeam?.id ||
                entry?.parentTeamId ||
                0
            ) === teamId
        )
        .map((entry: any) => {
          const id =
            text(entry?.id);

          return {
            playerId: id,
            playerName: text(
              entry?.fullName ||
                "Player"
            ),
            position: text(
              entry?.primaryPosition
                ?.abbreviation ||
                ""
            ),
            starter: false,
            active: true,
            headshot:
              `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${id}/headshot/67/current`,
          };
        })
        .filter(
          (player: RosterPlayer) =>
            Boolean(
              player.playerId
            )
        );
    }

    if (!players.length && team?.id) {
      try {
        const rosterPayload =
          await fetchJson(
            `https://statsapi.mlb.com/api/v1/teams/${encodeURIComponent(
              String(team.id)
            )}/roster?rosterType=active&hydrate=person`
          );

        players = (
          rosterPayload?.roster || []
        )
          .map((entry: any) => {
            const person =
              entry?.person || {};

            const id =
              text(person?.id);

            if (!id) return null;

            return {
              playerId: id,
              playerName: text(
                person?.fullName ||
                  "Player"
              ),
              position: text(
                entry?.position
                  ?.abbreviation ||
                  entry?.position?.name ||
                  ""
              ),
              starter: false,
              active: true,
              headshot:
                `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${id}/headshot/67/current`,
            } as RosterPlayer;
          })
          .filter(
            (
              player: RosterPlayer | null
            ): player is RosterPlayer =>
              Boolean(player)
          );
      } catch {}
    }

    players.sort(
      (a, b) =>
        Number(b.starter) -
          Number(a.starter) ||
        a.playerName.localeCompare(
          b.playerName
        )
    );

    rosters.push({
      teamId: text(team?.id),
      teamName: text(
        team?.name || side
      ),
      teamAbbr: text(
        team?.abbreviation || ""
      ),
      teamLogo: team?.id
        ? `https://www.mlbstatic.com/team-logos/${team.id}.svg`
        : "",
      side,
      players,
    });
  }

  const weather =
    feed?.gameData?.weather || {};

  const venue =
    feed?.gameData?.venue || {};

  return {
    rosters,
    context: {
      spread: "",
      total: null,
      weather: [
        weather?.temp
          ? `${weather.temp}°`
          : "",
        weather?.condition || "",
        weather?.wind || "",
      ]
        .filter(Boolean)
        .join(" · "),
      broadcast: [],
      venue: text(
        venue?.name || ""
      ),
      provider: "",
    } satisfies GameContext,
    injuries: [] as InjuryRow[],
    recentMatchups: [] as RecentRow[],
  };
}

async function nhlGameDetail(
  gameId: string
) {
  const payload =
    await fetchJson(
      `https://api-web.nhle.com/v1/gamecenter/${encodeURIComponent(
        gameId
      )}/boxscore`
    );

  const rosters: Roster[] = [];

  for (
    const side of
      ["away", "home"] as const
  ) {
    const team =
      payload?.[`${side}Team`] || {};

    const stats =
      payload?.playerByGameStats?.[
        side
      ] || {};

    const players: RosterPlayer[] = [];

    for (
      const bucket of
        [
          "forwards",
          "defense",
          "goalies",
        ]
    ) {
      for (
        const row of
          stats?.[bucket] || []
      ) {
        const id =
          text(row?.playerId);

        if (!id) continue;

        const name =
          text(
            row?.name?.default
          ) ||
          [
            text(
              row?.firstName?.default
            ),
            text(
              row?.lastName?.default
            ),
          ]
            .filter(Boolean)
            .join(" ") ||
          "Player";

        players.push({
          playerId: id,
          playerName: name,
          position: text(
            row?.position ||
              (bucket ===
              "goalies"
                ? "G"
                : "")
          ),
          starter: Boolean(
            row?.starter
          ),
          active: true,
          headshot: text(
            row?.headshot || ""
          ),
        });
      }
    }

    rosters.push({
      teamId: text(team?.id),
      teamName: text(
        team?.name?.default ||
          team?.commonName?.default ||
          team?.abbrev ||
          "Team"
      ),
      teamAbbr: text(
        team?.abbrev || ""
      ),
      teamLogo: text(
        team?.logo || ""
      ),
      side,
      players: [
        ...new Map(
          players.map(
            (player) => [
              player.playerId,
              player,
            ]
          )
        ).values(),
      ],
    });
  }

  return {
    rosters,
    context: {
      spread: "",
      total: null,
      weather: "Indoor / rink",
      broadcast: [],
      venue: text(
        payload?.venue?.default ||
          ""
      ),
      provider: "",
    } satisfies GameContext,
    injuries: [] as InjuryRow[],
    recentMatchups: [] as RecentRow[],
  };
}

export async function GET(
  req: NextRequest
) {
  const sport = String(
    req.nextUrl.searchParams.get(
      "sport"
    ) || ""
  ).toLowerCase() as SportKey;

  const gameId =
    req.nextUrl.searchParams.get(
      "gameId"
    ) || "";

  const league =
    req.nextUrl.searchParams.get(
      "league"
    ) || "eng.1";

  const allowed: SportKey[] = [
    "mlb",
    "nfl",
    "cfb",
    "nba",
    "wnba",
    "nhl",
    "soccer",
    "cbb",
  ];

  if (
    !allowed.includes(sport) ||
    !gameId
  ) {
    return NextResponse.json(
      {
        success: false,
        rosters: [],
        error:
          "Invalid game detail request",
      },
      { status: 400 }
    );
  }

  try {
    let payload: {
      rosters: Roster[];
      context: GameContext;
      injuries: InjuryRow[];
      recentMatchups: RecentRow[];
    };

    if (sport === "mlb") {
      payload =
        await mlbGameDetail(
          gameId
        );
    } else if (sport === "nhl") {
      payload =
        await nhlGameDetail(
          gameId
        );
    } else if (
      sport === "nba"
    ) {
      const generic =
        await espnGameDetail(
          "nba",
          gameId,
          league
        );

      try {
        const rosters =
          await loadNbaGameRosters(
            gameId
          );

        if (rosters.length) {
          generic.rosters =
            rosters.map(
              (
                roster: any,
                index: number
              ) => ({
                ...roster,
                side:
                  index === 0
                    ? "away"
                    : index === 1
                      ? "home"
                      : "",
              })
            );
        }
      } catch {}

      payload = generic;
    } else if (
      sport === "cbb"
    ) {
      const generic =
        await espnGameDetail(
          "cbb",
          gameId,
          league
        );

      try {
        const rosters =
          await loadCbbGameRosters(
            gameId
          );

        if (rosters.length) {
          generic.rosters =
            rosters.map(
              (
                roster: any,
                index: number
              ) => ({
                ...roster,
                side:
                  index === 0
                    ? "away"
                    : index === 1
                      ? "home"
                      : "",
              })
            );
        }
      } catch {}

      payload = generic;
    } else {
      payload =
        await espnGameDetail(
          sport as Exclude<
            SportKey,
            "mlb" | "nhl"
          >,
          gameId,
          league
        );
    }

    return NextResponse.json({
      success: true,
      sport,
      gameId,
      ...payload,
      updatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        sport,
        gameId,
        rosters: [],
        context: {
          spread: "",
          total: null,
          weather: "",
          broadcast: [],
          venue: "",
          provider: "",
        },
        injuries: [],
        recentMatchups: [],
        error:
          error instanceof Error
            ? error.message
            : "Game detail unavailable",
        updatedAt:
          new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
