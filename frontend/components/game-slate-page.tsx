"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SportsNav } from "@/components/dashboard-chrome";
import styles from "./game-slate.module.css";

export type GameSlateSport =
  | "mlb"
  | "nfl"
  | "cfb"
  | "nba"
  | "wnba"
  | "nhl"
  | "soccer"
  | "cbb";

type Game = {
  id: string;
  date: string;
  awayTeam: string;
  awayAbbr: string;
  awayLogo?: string | null;
  awayScore?: number | string | null;
  awayRecord?: string;
  homeTeam: string;
  homeAbbr: string;
  homeLogo?: string | null;
  homeScore?: number | string | null;
  homeRecord?: string;
  state: "pre" | "in" | "post";
  status: string;
  venue?: string;
  weekNumber?: number | null;
};

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

type RankingRow = {
  rank?: number;
  playerId?: string | number;
  playerName?: string;
  teamName?: string;
  matchup?: string;
  position?: string;
  market?: string;
  marketLabel?: string;
  sportsbookLine?: number | null;
  modelProjection?: number | null;
  giScore?: number | null;
  modelProbability?: number | null;
  headshot?: string;
  prediction?: string;
  actual?: number | null;
  gameState?: string;
  gameStatus?: string;
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

type DetailPayload = {
  rosters?: Roster[];
  context?: {
    spread?: string;
    total?: number | null;
    weather?: string;
    broadcast?: string[];
    venue?: string;
    provider?: string;
  };
  injuries?: InjuryRow[];
  recentMatchups?: RecentRow[];
};

type DetailTab =
  | "overview"
  | "rankings"
  | "rosters"
  | "props"
  | "trends";

const LABELS: Record<GameSlateSport, string> = {
  mlb: "MLB",
  nfl: "NFL",
  cfb: "CFB",
  nba: "NBA",
  wnba: "WNBA",
  nhl: "NHL",
  soccer: "Soccer",
  cbb: "CBB",
};

const ICONS: Record<GameSlateSport, string> = {
  mlb: "⚾",
  nfl: "🏈",
  cfb: "🏈",
  nba: "🏀",
  wnba: "🏀",
  nhl: "🏒",
  soccer: "⚽",
  cbb: "🏀",
};

const MARKET_CONFIG: Record<GameSlateSport, Array<[string, string]>> = {
  mlb: [
    ["home_runs", "Home Runs"],
    ["hits", "Hits"],
    ["total_bases", "Total Bases"],
    ["strikeouts", "Pitcher Strikeouts"],
  ],
  nfl: [
    ["passing_yards", "Passing Yards"],
    ["receiving_yards", "Receiving Yards"],
    ["rushing_yards", "Rushing Yards"],
    ["receptions", "Receptions"],
  ],
  cfb: [
    ["passing_yards", "Passing Yards"],
    ["rushing_yards", "Rushing Yards"],
    ["receiving_yards", "Receiving Yards"],
    ["receptions", "Receptions"],
  ],
  nba: [
    ["points", "Points"],
    ["rebounds", "Rebounds"],
    ["assists", "Assists"],
    ["pts_rebs_asts", "PRA"],
  ],
  wnba: [
    ["points", "Points"],
    ["rebounds", "Rebounds"],
    ["assists", "Assists"],
    ["pts_rebs_asts", "PRA"],
  ],
  nhl: [
    ["shots_on_goal", "Shots on Goal"],
    ["goals", "Goals"],
    ["assists", "Assists"],
    ["goalie_saves", "Goalie Saves"],
  ],
  soccer: [
    ["shots_on_target", "Shots on Target"],
    ["shots", "Shots"],
    ["saves", "Goalkeeper Saves"],
    ["goals", "Goals"],
  ],
  cbb: [
    ["points", "Points"],
    ["rebounds", "Rebounds"],
    ["assists", "Assists"],
    ["pts_rebs_asts", "PRA"],
  ],
};

type CachedGameDetail = {
  at: number;
  payload: DetailPayload;
};

type CachedGameRankings = {
  at: number;
  rows: RankingRow[];
};

const gameDetailCache = new Map<string, CachedGameDetail>();
const gameRankingCache = new Map<string, CachedGameRankings>();
const GAME_CACHE_MS = 60_000;

function gameCacheKey(
  sport: GameSlateSport,
  league: string,
  gameId: string
) {
  return `${sport}|${league}|${gameId}`;
}

const clean = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function localDay(value: string) {
  const d = new Date(value);
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

function fullDayLabel(value: string) {
  const d = new Date(`${value}T12:00:00-04:00`);
  if (Number.isNaN(d.getTime())) return "Upcoming";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(d);
}

function addDay(value: string, amount: number) {
  const d = new Date(`${value}T12:00:00-04:00`);
  if (Number.isNaN(d.getTime())) return value;
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

function shortDay(value: string) {
  const d = new Date(`${value}T12:00:00-04:00`);

  return {
    dow: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      weekday: "short",
    }).format(d),
    date: new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Toronto",
      month: "short",
      day: "numeric",
    }).format(d),
  };
}

function timeLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Time TBD";

  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d)} ET`;
}

function longTimeLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Time TBD";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);

  return (
    parts.length > 1
      ? `${parts[0][0]}${parts.at(-1)?.[0] || ""}`
      : parts[0]?.slice(0, 2) || "SS"
  ).toUpperCase();
}

function gameMatchesRow(game: Game, row: RankingRow) {
  const matchup = clean(row.matchup);
  const team = clean(row.teamName);
  const away = [clean(game.awayTeam), clean(game.awayAbbr)].filter(Boolean);
  const home = [clean(game.homeTeam), clean(game.homeAbbr)].filter(Boolean);

  if (
    away.some((value) => matchup.includes(value)) &&
    home.some((value) => matchup.includes(value))
  ) {
    return true;
  }

  return [...away, ...home].some(
    (value) =>
      value &&
      (team === value || team.includes(value) || value.includes(team))
  );
}

function rowBelongsTo(
  row: RankingRow,
  side: "away" | "home",
  game: Game
) {
  const targets =
    side === "away"
      ? [clean(game.awayTeam), clean(game.awayAbbr)]
      : [clean(game.homeTeam), clean(game.homeAbbr)];

  const team = clean(row.teamName);

  return targets.some(
    (value) =>
      value &&
      (team === value || team.includes(value) || value.includes(team))
  );
}

function playerHref(
  sport: GameSlateSport,
  row: RankingRow,
  game: Game
) {
  const id = encodeURIComponent(
    String(row.playerId || clean(row.playerName))
  );

  const qs = new URLSearchParams({
    name: row.playerName || "Player",
    team: row.teamName || "",
    matchup: `${game.awayTeam} @ ${game.homeTeam}`,
    market: row.market || "",
    line: String(row.sportsbookLine ?? ""),
    projection: String(row.modelProjection ?? ""),
    gi: String(row.giScore ?? ""),
    prob: String(row.modelProbability ?? ""),
    pick: row.prediction || "",
    position: row.position || "",
    state: row.gameState || game.state || "",
    status: row.gameStatus || game.status || "",
    actual: String(row.actual ?? ""),
    img: row.headshot || "",
    mode: "prediction",
  });

  return `/${sport}/player/${id}?${qs.toString()}`;
}

function researchMarketForPlayer(
  sport: GameSlateSport,
  position: string
) {
  const pos = String(position || "").toUpperCase();

  if (sport === "mlb") {
    return ["P", "SP", "RP"].includes(pos)
      ? "strikeouts"
      : "hits";
  }

  if (sport === "nfl") {
    if (pos === "QB") return "passing_yards";
    if (pos === "RB" || pos === "FB") return "rushing_yards";
    if (pos === "WR" || pos === "TE") return "receiving_yards";
    if (
      ["S", "FS", "SS", "CB", "DB", "LB", "ILB", "OLB", "MLB", "DE", "DT", "DL"].includes(pos)
    ) {
      return "tackles_assists";
    }
    return "anytime_td";
  }

  if (sport === "cfb") {
    if (pos === "QB") return "passing_yards";
    if (pos === "RB" || pos === "FB") return "rushing_yards";
    if (pos === "WR" || pos === "TE") return "receiving_yards";
    return "anytime_td";
  }

  if (sport === "nba" || sport === "wnba" || sport === "cbb") {
    return "points";
  }

  if (sport === "nhl") {
    return pos === "G" ? "goalie_saves" : "shots_on_goal";
  }

  if (sport === "soccer") {
    return pos === "GK" || pos === "G" ? "saves" : "shots";
  }

  return "";
}

function sameRosterPlayer(
  row: RankingRow,
  player: RosterPlayer
) {
  const rowId = String(row.playerId || "");
  const playerId = String(player.playerId || "");

  if (rowId && playerId && rowId === playerId) {
    return true;
  }

  return clean(row.playerName) === clean(player.playerName);
}

function rosterPlayerHref(
  sport: GameSlateSport,
  player: RosterPlayer,
  roster: Roster,
  game: Game,
  prediction?: RankingRow
) {
  if (prediction && gradeableRankingRow(prediction)) {
    return playerHref(sport, prediction, game);
  }
  const qs = new URLSearchParams({
    name: player.playerName,
    team: roster.teamName,
    matchup: `${game.awayTeam} @ ${game.homeTeam}`,
    position: player.position || "",
    market: researchMarketForPlayer(
      sport,
      player.position
    ),
    state: game.state || "",
    status: game.status || "",
    img: player.headshot || "",
    mode: "profile",
  });

  return `/${sport}/player/${encodeURIComponent(
    player.playerId
  )}?${qs.toString()}`;
}

function dedupePlayers(rows: RankingRow[]) {
  const seen = new Set<string>();
  const out: RankingRow[] = [];

  for (const row of rows) {
    const key =
      String(row.playerId || "") ||
      `${clean(row.playerName)}|${clean(row.teamName)}`;

    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(row);
  }

  return out;
}

function finiteNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRankingRow(
  raw: any,
  market: string,
  marketLabel: string
): RankingRow {
  const playerName =
    raw?.playerName ??
    raw?.player_name ??
    raw?.player ??
    raw?.batter_name ??
    raw?.pitcher_name ??
    "";

  const teamName =
    raw?.teamName ??
    raw?.team_name ??
    raw?.team ??
    raw?.team_abbreviation ??
    raw?.teamAbbr ??
    "";

  const opponent =
    raw?.opponentName ??
    raw?.opponent_name ??
    raw?.opponent ??
    raw?.opponent_abbreviation ??
    "";

  return {
    ...raw,
    rank: Number(raw?.rank || 0) || undefined,
    playerId:
      raw?.playerId ??
      raw?.player_id ??
      raw?.batter_id ??
      raw?.pitcher_id ??
      undefined,
    playerName: String(playerName || ""),
    teamName: String(teamName || ""),
    matchup: String(
      raw?.matchup ||
      (teamName && opponent ? `${teamName} vs ${opponent}` : "")
    ),
    position: String(
      raw?.position ??
      raw?.position_abbreviation ??
      raw?.pos ??
      ""
    ),
    sportsbookLine: finiteNumber(
      raw?.sportsbookLine ??
      raw?.sportsbook_line ??
      raw?.marketLine ??
      raw?.market_line ??
      raw?.line
    ),
    modelProjection: finiteNumber(
      raw?.modelProjection ??
      raw?.model_projection ??
      raw?.projection ??
      raw?.perGame ??
      raw?.modelTarget
    ),
    giScore: finiteNumber(
      raw?.giScore ??
      raw?.gi_score ??
      raw?.score
    ),
    modelProbability: finiteNumber(
      raw?.modelProbability ??
      raw?.model_probability ??
      raw?.probability ??
      raw?.home_run_probability ??
      raw?.hr_probability
    ),
    headshot: String(
      raw?.headshot ??
      raw?.headshot_url ??
      raw?.photoUrl ??
      raw?.photo_url ??
      ""
    ),
    prediction: String(
      raw?.prediction ??
      raw?.pickSide ??
      raw?.pick ??
      ""
    ).toUpperCase() || undefined,
    actual: finiteNumber(
      raw?.actual ??
      raw?.actualResult ??
      raw?.liveCurrent
    ),
    gameState: String(
      raw?.gameState ??
      raw?.state ??
      ""
    ) || undefined,
    gameStatus: String(
      raw?.gameStatus ??
      raw?.status ??
      ""
    ) || undefined,
    market,
    marketLabel,
  };
}

function usefulRankingRow(row: RankingRow) {
  return gradeableRankingRow(row);
}

const PRICE_ONLY_MARKETS = new Set([
  "home_runs",
  "anytime_td",
  "first_td",
  "q1_anytime_td",
]);

function gradeableRankingRow(row: RankingRow) {
  if (!row.playerName || row.playerName === "Player") return false;

  if (PRICE_ONLY_MARKETS.has(String(row.market || ""))) {
    return (
      row.prediction != null ||
      row.modelProbability != null ||
      row.sportsbookLine != null
    );
  }

  return (
    row.sportsbookLine != null &&
    (row.modelProjection != null || row.modelProbability != null)
  );
}

function rosterWatchRow(
  player: RosterPlayer | undefined,
  teamName: string
): RankingRow | undefined {
  if (!player) return undefined;

  return {
    playerId: player.playerId,
    playerName: player.playerName,
    teamName,
    position: player.position,
    headshot: player.headshot,
    market: "watch",
    marketLabel: "Player to Watch",
    sportsbookLine: null,
    modelProjection: null,
    giScore: null,
  };
}

async function fetchRankings(
  sport: GameSlateSport,
  league: string,
  game: Game,
  signal: AbortSignal
): Promise<RankingRow[]> {
  const cacheKey = gameCacheKey(sport, league, game.id);
  const cached = gameRankingCache.get(cacheKey);

  if (cached && Date.now() - cached.at < GAME_CACHE_MS) {
    return cached.rows;
  }

  const markets = MARKET_CONFIG[sport];

  if (sport === "mlb") {
    const response = await fetch("/api/mlb/rankings", {
      cache: "no-store",
      signal,
    });

    if (!response.ok) return [];

    const payload = await response.json();
    const rows: RankingRow[] = [];

    for (const [market, label] of markets) {
      const source =
        payload?.batter?.[market] ||
        payload?.pitcher?.[market] ||
        [];

      for (const row of source || []) {
        rows.push(
          normalizeRankingRow(
            row,
            market,
            label
          )
        );
      }
    }

    const result = rows
      .filter(usefulRankingRow)
      .filter((row) => gameMatchesRow(game, row))
      .sort(
        (a, b) =>
          Number(b.giScore || 0) -
          Number(a.giScore || 0)
      )
      .slice(0, 28);

    gameRankingCache.set(cacheKey, { at: Date.now(), rows: result });
    return result;
  }

  if (sport === "soccer") {
    const response = await fetch(
      `/api/soccer/dashboard?league=${encodeURIComponent(league)}`,
      {
        cache: "no-store",
        signal,
      }
    );

    if (!response.ok) return [];

    const payload = await response.json();
    const rows: RankingRow[] = [];

    for (const [market, label] of markets) {
      for (const raw of payload?.rankings?.[market] || []) {
        rows.push(
          normalizeRankingRow(
            {
              ...raw,
              teamName:
                raw?.teamName ??
                raw?.team,
            },
            market,
            label
          )
        );
      }
    }

    const result = rows
      .filter(usefulRankingRow)
      .filter((row) => gameMatchesRow(game, row))
      .sort(
        (a, b) =>
          Number(b.giScore || 0) -
          Number(a.giScore || 0)
      )
      .slice(0, 28);

    gameRankingCache.set(cacheKey, { at: Date.now(), rows: result });
    return result;
  }

  const blocks = await Promise.all(
    markets.map(async ([market, label]) => {
      const url =
        sport === "cfb"
          ? `/api/cfb/rankings-board?market=${encodeURIComponent(
              market
            )}&slate=all`
          : `/api/${sport}/rankings?market=${encodeURIComponent(market)}`;

      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal,
        });

        if (!response.ok) return [];

        const payload = await response.json();

        return (payload?.rows || []).map(
          (row: RankingRow) =>
            normalizeRankingRow(
              row,
              market,
              label
            )
        );
      } catch {
        return [];
      }
    })
  );

  const result = blocks
    .flat()
    .filter(usefulRankingRow)
    .filter((row) => gameMatchesRow(game, row))
    .sort(
      (a, b) =>
        Number(b.giScore || 0) -
        Number(a.giScore || 0)
    )
    .slice(0, 32);

  gameRankingCache.set(cacheKey, { at: Date.now(), rows: result });
  return result;
}

function TeamLogo({
  src,
  name,
}: {
  src?: string | null;
  name: string;
}) {
  if (src) {
    return <img src={src} alt="" />;
  }

  return (
    <span className={styles.logoFallback}>
      {initials(name)}
    </span>
  );
}

function BrandHeader({
  sport,
}: {
  sport: GameSlateSport;
}) {
  return (
    <>
      <div className={styles.brand}>
        <img src="/brand/sach-sports-crown-logo.png" alt="" />
        <strong>
          <span>SACH</span> SPORTS
        </strong>
      </div>

      <SportsNav active={sport} />
    </>
  );
}

function ContextMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={styles.contextMetric}>
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function PlayerWatchCard({
  sport,
  game,
  row,
  fallbackTeam,
  logo,
}: {
  sport: GameSlateSport;
  game: Game;
  row?: RankingRow;
  fallbackTeam: string;
  logo?: string | null;
}) {
  const body = (
    <div className={styles.watchCard}>
      <div className={styles.watchTop}>
        <TeamLogo src={logo} name={fallbackTeam} />
        <span>
          <b>{row?.playerName || fallbackTeam}</b>
          <small>
            {[
              row?.position,
              row?.marketLabel || row?.market,
            ]
              .filter(Boolean)
              .join(" · ") || "Team watch"}
          </small>
        </span>
      </div>

      <ul>
        {row ? (
          <>
            <li>
              GI{" "}
              {row.giScore == null
                ? "—"
                : Number(row.giScore).toFixed(1)}
            </li>
            <li>
              {row.modelProjection == null
                ? "Projection building"
                : `Projection ${Number(
                    row.modelProjection
                  ).toFixed(1)}`}
            </li>
            <li>
              {row.sportsbookLine == null
                ? "Sportsbook line pending"
                : `Line ${row.sportsbookLine}`}
            </li>
          </>
        ) : (
          <li>Player intelligence will populate as rankings become available.</li>
        )}
      </ul>
    </div>
  );

  if (!row) return body;

  return (
    <Link
      href={playerHref(sport, row, game)}
      className={styles.watchLink}
    >
      {body}
    </Link>
  );
}

function TeamRankingTable({
  sport,
  game,
  side,
  rows,
}: {
  sport: GameSlateSport;
  game: Game;
  side: "away" | "home";
  rows: RankingRow[];
}) {
  const teamName =
    side === "away"
      ? game.awayTeam
      : game.homeTeam;

  const abbr =
    side === "away"
      ? game.awayAbbr
      : game.homeAbbr;

  return (
    <section className={styles.teamRankPanel}>
      <div className={styles.teamRankHead}>
        <strong>
          {teamName} ({abbr})
        </strong>
      </div>

      <div className={styles.rankHeader}>
        <span>#</span>
        <span>Player</span>
        <span>Pos</span>
        <span>Line</span>
        <span>Proj</span>
        <span>GI</span>
      </div>

      {rows.length ? (
        rows.slice(0, 5).map((row, index) => (
          <Link
            href={playerHref(sport, row, game)}
            className={styles.compactRankRow}
            key={`${row.playerId}-${row.market}-${index}`}
          >
            <span>{index + 1}</span>

            <span className={styles.compactPlayer}>
              {row.headshot ? (
                <img src={row.headshot} alt="" />
              ) : (
                <i>{initials(row.playerName || "P")}</i>
              )}

              <b>{row.playerName || "Player"}</b>
            </span>

            <span>{row.position || "—"}</span>

            <span>
              {row.sportsbookLine == null
                ? "—"
                : row.sportsbookLine}
            </span>

            <span>
              {row.modelProjection == null
                ? "—"
                : Number(row.modelProjection).toFixed(1)}
            </span>

            <strong>
              {row.giScore == null
                ? "—"
                : Number(row.giScore).toFixed(1)}
            </strong>
          </Link>
        ))
      ) : (
        <div className={styles.miniEmpty}>
          No ranked players currently attached to this team.
        </div>
      )}

      <div className={styles.teamRankFooter}>
        Top game-specific Sach rankings
      </div>
    </section>
  );
}

function ExpandedGame({
  sport,
  league,
  game,
}: {
  sport: GameSlateSport;
  league: string;
  game: Game;
}) {
  const [detail, setDetail] = useState<DetailPayload>({});
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [rosterSide, setRosterSide] =
    useState<"away" | "home">("away");
  const [rankingSide, setRankingSide] =
    useState<"away" | "home">("away");
  const [showFullRoster, setShowFullRoster] = useState(false);
  const [position, setPosition] = useState("All");

  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = gameCacheKey(sport, league, game.id);
    const cachedDetail = gameDetailCache.get(cacheKey);
    const cachedRankings = gameRankingCache.get(cacheKey);

    if (cachedDetail && Date.now() - cachedDetail.at < GAME_CACHE_MS) {
      setDetail(cachedDetail.payload);
    }

    if (cachedRankings && Date.now() - cachedRankings.at < GAME_CACHE_MS) {
      setRankings(cachedRankings.rows);
    }

    setLoading(!(cachedDetail && cachedRankings));

    Promise.all([
      fetch(
        `/api/game-slate-detail?sport=${encodeURIComponent(
          sport
        )}&gameId=${encodeURIComponent(
          game.id
        )}&league=${encodeURIComponent(league)}`,
        {
          cache: "no-store",
          signal: controller.signal,
        }
      )
        .then(async (response) => {
          if (!response.ok) return cachedDetail?.payload || {};
          const payload = await response.json();
          gameDetailCache.set(cacheKey, { at: Date.now(), payload });
          return payload;
        })
        .catch(() => cachedDetail?.payload || {}),
      fetchRankings(
        sport,
        league,
        game,
        controller.signal
      ).catch(() => cachedRankings?.rows || []),
    ]).then(([nextDetail, nextRankings]) => {
      if (controller.signal.aborted) return;

      setDetail(nextDetail || {});
      setRankings(nextRankings || []);
      setLoading(false);
    });

    return () => controller.abort();
  }, [sport, league, game.id]);

  const rosters = detail.rosters || [];
  const context = detail.context || {};
  const injuries = detail.injuries || [];
  const recent = detail.recentMatchups || [];

  const awayRoster =
    rosters.find((roster) => roster.side === "away") ||
    rosters.find((roster) =>
      clean(roster.teamName).includes(clean(game.awayTeam))
    ) ||
    rosters[0];

  const homeRoster =
    rosters.find((roster) => roster.side === "home") ||
    rosters.find((roster) =>
      clean(roster.teamName).includes(clean(game.homeTeam))
    ) ||
    rosters[1];

  const activeRoster =
    rosterSide === "away"
      ? awayRoster
      : homeRoster;

  const awayRows = dedupePlayers(
    rankings.filter((row) =>
      rowBelongsTo(row, "away", game)
    )
  );

  const homeRows = dedupePlayers(
    rankings.filter((row) =>
      rowBelongsTo(row, "home", game)
    )
  );

  const positions = [
    "All",
    ...Array.from(
      new Set(
        rankings
          .map((row) => String(row.position || "").toUpperCase())
          .filter(Boolean)
      )
    ).slice(0, 7),
  ];

  const filteredRows = rankings.filter((row) => {
    const matchesPosition =
      position === "All" ||
      String(row.position || "").toUpperCase() === position;

    return gradeableRankingRow(row) && matchesPosition;
  });

  const filteredAway = dedupePlayers(
    filteredRows.filter((row) =>
      rowBelongsTo(row, "away", game)
    )
  );

  const filteredHome = dedupePlayers(
    filteredRows.filter((row) =>
      rowBelongsTo(row, "home", game)
    )
  );

  const rosterPlayers = activeRoster?.players || [];

  const visibleRoster = showFullRoster
    ? rosterPlayers
    : rosterPlayers.slice(0, 12);

  const awayWatch =
    awayRows[0] ||
    rosterWatchRow(
      awayRoster?.players?.find((player) => player.starter) ||
        awayRoster?.players?.[0],
      game.awayTeam
    );

  const homeWatch =
    homeRows[0] ||
    rosterWatchRow(
      homeRoster?.players?.find((player) => player.starter) ||
        homeRoster?.players?.[0],
      game.homeTeam
    );

  const injuryByTeam = (teamName: string) =>
    injuries
      .filter(
        (row) =>
          clean(row.teamName).includes(clean(teamName)) ||
          clean(teamName).includes(clean(row.teamName))
      )
      .slice(0, 4);

  const spread = context.spread || "—";
  const total =
    context.total == null
      ? "—"
      : String(context.total);
  const weather =
    context.weather || "Indoor / feed pending";

  const overviewCopy =
    context.spread !== undefined ||
    context.total != null
      ? `Current market context lists ${
          context.spread || "no posted spread"
        }${
          context.total != null
            ? ` with a game total of ${context.total}`
            : ""
        }. Player rankings below use the current Sach model and available sportsbook data.`
      : `Matchup intelligence is connected. Team context, ranked players and roster information update as the provider feeds publish them.`;

  const trendRows = [...rankings]
    .filter(
      (row) =>
        row.modelProjection != null &&
        row.sportsbookLine != null
    )
    .sort(
      (a, b) =>
        Math.abs(
          Number(b.modelProjection) -
            Number(b.sportsbookLine)
        ) -
        Math.abs(
          Number(a.modelProjection) -
            Number(a.sportsbookLine)
        )
    )
    .slice(0, 8);

  return (
    <div className={styles.expanded}>
      <section className={styles.intelHeader}>
        <div className={styles.intelHeadline}>
          <h1>
            <span>{ICONS[sport]}</span>
            Game Intelligence
          </h1>

          <strong>
            {game.awayTeam} @ {game.homeTeam}
          </strong>

          <p>
            {game.state === "in"
              ? `LIVE · ${game.status}`
              : game.state === "post"
                ? "Final"
                : longTimeLabel(game.date)}
            {game.venue
              ? ` · ${game.venue}`
              : ""}
          </p>
        </div>

        <div className={styles.intelScore}>
          <div>
            <TeamLogo
              src={game.awayLogo}
              name={game.awayTeam}
            />
            <span>
              <b>{game.awayTeam}</b>
              <small>
                {game.awayRecord || "—"} · AWAY
              </small>
            </span>
            {game.state !== "pre" ? (
              <strong>{game.awayScore ?? "—"}</strong>
            ) : null}
          </div>

          <i>@</i>

          <div>
            <TeamLogo
              src={game.homeLogo}
              name={game.homeTeam}
            />
            <span>
              <b>{game.homeTeam}</b>
              <small>
                {game.homeRecord || "—"} · HOME
              </small>
            </span>
            {game.state !== "pre" ? (
              <strong>{game.homeScore ?? "—"}</strong>
            ) : null}
          </div>
        </div>
      </section>

      <nav className={styles.intelTabs}>
        {[
          ["overview", "Overview"],
          ["rankings", "Player Rankings"],
          ["rosters", "Rosters"],
          ["props", "Props"],
          ["trends", "Trends"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={
              tab === key
                ? styles.activeIntelTab
                : ""
            }
            onClick={() =>
              setTab(key as DetailTab)
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className={styles.loadingPanel}>
          Loading Game Intelligence…
        </div>
      ) : null}

      {!loading && tab === "overview" ? (
        <div className={styles.tabBody}>
          <section className={styles.goldPanel}>
            <div className={styles.panelTitle}>
              <span>▦</span>
              <h4>Game Context</h4>
            </div>

            <div className={styles.contextMetrics}>
              <ContextMetric label="Spread" value={spread} />
              <ContextMetric label="Game Total" value={total} />
              <ContextMetric label="Weather" value={weather} />
            </div>

            <p className={styles.contextCopy}>
              {overviewCopy}
            </p>
          </section>

          <section className={styles.goldPanel}>
            <div className={styles.panelTitle}>
              <span>★</span>
              <h4>Key Players to Watch</h4>
            </div>

            <div className={styles.watchGrid}>
              <PlayerWatchCard
                sport={sport}
                game={game}
                row={awayWatch}
                fallbackTeam={game.awayTeam}
                logo={game.awayLogo}
              />

              <PlayerWatchCard
                sport={sport}
                game={game}
                row={homeWatch}
                fallbackTeam={game.homeTeam}
                logo={game.homeLogo}
              />
            </div>
          </section>

          <section className={styles.overviewGrid}>
            <div className={styles.goldPanel}>
              <div className={styles.panelTitle}>
                <span>▥</span>
                <h4>Recent Matchups</h4>
              </div>

              {recent.length ? (
                <div className={styles.historyList}>
                  {recent.slice(0, 4).map((row, index) => (
                    <div key={`${row.date}-${index}`}>
                      <span>{row.date || "Recent"}</span>
                      <strong>{row.result}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.smallMuted}>
                  Recent head-to-head history will appear when the live provider publishes it.
                </p>
              )}
            </div>

            <div className={styles.goldPanel}>
              <div className={styles.panelTitle}>
                <span>✚</span>
                <h4>Injury Report</h4>
              </div>

              <div className={styles.injuryColumns}>
                {[game.awayTeam, game.homeTeam].map(
                  (team) => {
                    const rows = injuryByTeam(team);

                    return (
                      <div key={team}>
                        <strong>{team}</strong>

                        {rows.length ? (
                          rows.map((row, index) => (
                            <span
                              key={`${row.playerName}-${index}`}
                            >
                              {row.playerName}
                              {row.position
                                ? ` · ${row.position}`
                                : ""}
                              <em>
                                {row.status || "Reported"}
                              </em>
                            </span>
                          ))
                        ) : (
                          <span>No active injury feed</span>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {!loading && tab === "rankings" ? (
        <div className={styles.tabBody}>
          <section className={styles.goldPanel}>
            <div className={styles.panelTitle}>
              <span>★</span>
              <h4>Player Rankings</h4>
            </div>

            <div className={styles.teamSwitch}>
              <button
                type="button"
                className={rankingSide === "away" ? styles.activeTeamSwitch : ""}
                onClick={() => setRankingSide("away")}
              >
                {game.awayTeam} ({game.awayAbbr})
              </button>
              <button
                type="button"
                className={rankingSide === "home" ? styles.activeTeamSwitch : ""}
                onClick={() => setRankingSide("home")}
              >
                {game.homeTeam} ({game.homeAbbr})
              </button>
            </div>

            <div className={styles.positionPills}>
              {positions.map((item) => (
                <button
                  key={item}
                  className={
                    position === item
                      ? styles.activePosition
                      : ""
                  }
                  onClick={() => setPosition(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className={styles.teamTables}>
              <TeamRankingTable
                sport={sport}
                game={game}
                side={rankingSide}
                rows={rankingSide === "away" ? filteredAway : filteredHome}
              />
            </div>
          </section>
        </div>
      ) : null}

      {!loading && tab === "rosters" ? (
        <div className={styles.tabBody}>
          <section className={styles.goldPanel}>
            <div className={styles.panelTitle}>
              <span>👥</span>
              <h4>Player Roster</h4>
            </div>

            <div className={styles.rosterTools}>
              <div className={styles.teamSwitch}>
                <button
                  className={
                    rosterSide === "away"
                      ? styles.activeTeamSwitch
                      : ""
                  }
                  onClick={() => {
                    setRosterSide("away");
                    setShowFullRoster(false);
                  }}
                >
                  {game.awayTeam} ({game.awayAbbr})
                </button>

                <button
                  className={
                    rosterSide === "home"
                      ? styles.activeTeamSwitch
                      : ""
                  }
                  onClick={() => {
                    setRosterSide("home");
                    setShowFullRoster(false);
                  }}
                >
                  {game.homeTeam} ({game.homeAbbr})
                </button>
              </div>
            </div>

            {!activeRoster?.players?.length ? (
              <div className={styles.miniEmpty}>
                Roster data is not available yet for this matchup.
              </div>
            ) : null}

            <div className={styles.rosterList}>
              {visibleRoster.map((player) => (
                <Link
                  href={rosterPlayerHref(
                    sport,
                    player,
                    activeRoster,
                    game,
                    rankings.find((row) =>
                      sameRosterPlayer(
                        row,
                        player
                      )
                    )
                  )}
                  key={player.playerId}
                  className={styles.rosterRow}
                >
                  {player.headshot ? (
                    <img src={player.headshot} alt="" />
                  ) : (
                    <i>
                      {initials(player.playerName)}
                    </i>
                  )}

                  <span>
                    <b>{player.playerName}</b>
                    <small>
                      {player.position || "Player"}
                      {player.starter
                        ? " · Starter"
                        : ""}
                      {!player.active
                        ? " · Inactive"
                        : ""}
                    </small>
                  </span>

                  <strong>›</strong>
                </Link>
              ))}
            </div>

            {rosterPlayers.length > 12 ? (
              <button
                className={styles.fullRosterButton}
                onClick={() =>
                  setShowFullRoster((value) => !value)
                }
              >
                {showFullRoster
                  ? "Show Key Roster"
                  : `View Full ${
                      activeRoster?.teamAbbr || "Team"
                    } Roster`}
              </button>
            ) : null}
          </section>
        </div>
      ) : null}

      {!loading && tab === "props" ? (
        <div className={styles.tabBody}>
          <section className={styles.goldPanel}>
            <div className={styles.panelTitle}>
              <span>◈</span>
              <h4>Available Prop Intelligence</h4>
            </div>

            {rankings.filter(gradeableRankingRow).length ? (
              <div className={styles.propGrid}>
                {rankings
                  .filter(gradeableRankingRow)
                  .slice(0, 12)
                  .map((row, index) => (
                  <Link
                    href={playerHref(sport, row, game)}
                    className={styles.propCard}
                    key={`${row.playerId}-${row.market}-${index}`}
                  >
                    <span>
                      <b>{row.playerName}</b>
                      <small>
                        {row.marketLabel || row.market}
                      </small>
                    </span>

                    <span>
                      Line{" "}
                      <strong>
                        {row.sportsbookLine ?? "—"}
                      </strong>
                    </span>

                    <span>
                      Proj{" "}
                      <strong>
                        {row.modelProjection == null
                          ? "—"
                          : Number(
                              row.modelProjection
                            ).toFixed(1)}
                      </strong>
                    </span>

                    <em>
                      GI{" "}
                      {row.giScore == null
                        ? "—"
                        : Number(
                            row.giScore
                          ).toFixed(1)}
                    </em>
                  </Link>
                ))}
              </div>
            ) : (
              <div className={styles.miniEmpty}>
                Player-prop rankings have not populated for this matchup yet.
              </div>
            )}
          </section>
        </div>
      ) : null}

      {!loading && tab === "trends" ? (
        <div className={styles.tabBody}>
          <section className={styles.goldPanel}>
            <div className={styles.panelTitle}>
              <span>▥</span>
              <h4>Model Edge Trends</h4>
            </div>

            {trendRows.length ? (
              <div className={styles.trendList}>
                {trendRows.map((row, index) => {
                  const edge =
                    Number(row.modelProjection) -
                    Number(row.sportsbookLine);

                  return (
                    <Link
                      href={playerHref(sport, row, game)}
                      key={`${row.playerId}-${row.market}-${index}`}
                    >
                      <span>
                        <b>{row.playerName}</b>
                        <small>
                          {row.marketLabel || row.market}
                        </small>
                      </span>

                      <strong>
                        {edge >= 0 ? "+" : ""}
                        {edge.toFixed(1)}
                      </strong>

                      <em>
                        GI{" "}
                        {row.giScore == null
                          ? "—"
                          : Number(
                              row.giScore
                            ).toFixed(1)}
                      </em>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className={styles.miniEmpty}>
                Trend comparisons will populate once both a sportsbook line and model projection are available.
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function GameSlatePage({
  sport,
  league = "eng.1",
}: {
  sport: GameSlateSport;
  league?: string;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [weekNumber, setWeekNumber] =
    useState<number | null>(null);
  const [open, setOpen] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const requestedGameRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let controller: AbortController | null = null;

    const load = () => {
      controller?.abort();
      controller = new AbortController();

      const params = new URLSearchParams({
        sport,
        league,
      });

      fetch(`/api/game-slate?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((payload) => {
          if (!alive) return;

          setGames(
            Array.isArray(payload?.games)
              ? payload.games
              : []
          );

          setWeekNumber(
            Number(payload?.weekNumber || 0) || null
          );

          setError(
            payload?.success === false
              ? payload?.error ||
                  "Game slate unavailable."
              : ""
          );

          setLoading(false);
        })
        .catch(() => {
          if (
            !alive ||
            controller?.signal.aborted
          ) {
            return;
          }

          setError(
            "Game slate is temporarily unavailable."
          );
          setLoading(false);
        });
    };

    load();

    const timer = window.setInterval(
      load,
      30_000
    );

    return () => {
      alive = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [sport, league]);

  const dates = useMemo(() => {
    return Array.from(
      new Set(
        games
          .map((game) => localDay(game.date))
          .filter(Boolean)
      )
    ).sort();
  }, [games]);

  useEffect(() => {
    if (!dates.length) return;

    const today = localDay(new Date().toISOString());

    if (selectedDay && dates.includes(selectedDay)) {
      return;
    }

    const liveDay = games
      .filter((game) => game.state === "in")
      .map((game) => localDay(game.date))
      .find(Boolean);

    const futureDay = games
      .filter(
        (game) =>
          game.state === "pre" &&
          game.date &&
          new Date(game.date).getTime() >= Date.now()
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((game) => localDay(game.date))
      .find(Boolean);

    const pastDay = [...dates]
      .filter((date) => date < today)
      .sort()
      .at(-1);

    setSelectedDay(
      liveDay ||
      (dates.includes(today) ? today : "") ||
      futureDay ||
      pastDay ||
      dates[0]
    );
  }, [dates, selectedDay, games]);

  useEffect(() => {
    if (requestedGameRef.current === null) {
      try {
        requestedGameRef.current =
          new URLSearchParams(
            window.location.search
          ).get("game") || "";
      } catch {
        requestedGameRef.current = "";
      }
    }

    const requestedGame =
      requestedGameRef.current || "";

    if (!requestedGame || !games.length) {
      return;
    }

    const match = games.find(
      (game) =>
        String(game.id) ===
        String(requestedGame)
    );

    if (!match) return;

    setSelectedDay(localDay(match.date));
    setOpen(match.id);

    // Consume the request once so closing Game Intelligence
    // does not immediately reopen it.
    requestedGameRef.current = "";
  }, [games]);

  useEffect(() => {
    try {
      setSaved(
        localStorage.getItem(
          `sach-slate-saved-${sport}`
        ) === "1"
      );
    } catch {}
  }, [sport]);

  const dateIndex = Math.max(
    0,
    dates.indexOf(selectedDay)
  );

  const dateBase =
    selectedDay ||
    dates[0] ||
    localDay(new Date().toISOString());

  const visibleDatePills = [
    dateBase,
    addDay(dateBase, 1),
    addDay(dateBase, 2),
  ];

  const visibleGames = games.filter(
    (game) =>
      !selectedDay ||
      localDay(game.date) === selectedDay
  );

  const activeGame =
    games.find(
      (game) => game.id === open
    ) || null;

  useEffect(() => {
    if (!visibleGames.length) return;

    const controller = new AbortController();
    const targets = visibleGames.slice(0, 6);

    for (const game of targets) {
      const cacheKey = gameCacheKey(sport, league, game.id);
      const cachedDetail = gameDetailCache.get(cacheKey);

      if (!cachedDetail || Date.now() - cachedDetail.at >= GAME_CACHE_MS) {
        fetch(
          `/api/game-slate-detail?sport=${encodeURIComponent(
            sport
          )}&gameId=${encodeURIComponent(
            game.id
          )}&league=${encodeURIComponent(league)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        )
          .then((response) => response.ok ? response.json() : null)
          .then((payload) => {
            if (payload) {
              gameDetailCache.set(cacheKey, { at: Date.now(), payload });
            }
          })
          .catch(() => {});
      }

      fetchRankings(sport, league, game, controller.signal).catch(() => {});
    }

    return () => controller.abort();
  }, [sport, league, selectedDay, visibleGames.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLabel =
    selectedDay
      ? fullDayLabel(selectedDay)
      : "Upcoming";

  const toggleSaved = () => {
    const next = !saved;
    setSaved(next);

    try {
      localStorage.setItem(
        `sach-slate-saved-${sport}`,
        next ? "1" : "0"
      );
    } catch {}
  };

  const shareSlate = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${LABELS[sport]} Game Slate`,
          text: `Sach Sports ${LABELS[sport]} Game Slate`,
          url: window.location.href,
        });
        return;
      }

      await navigator.clipboard.writeText(
        window.location.href
      );
    } catch {}
  };

  return (
    <main className={styles.shell}>
      <div
        className={styles.goldWash}
        aria-hidden="true"
      />

      <BrandHeader sport={sport} />

      <div className={styles.utilityRow}>
        {activeGame ? (
          <button
            type="button"
            className={styles.backButton}
            onClick={() => setOpen("")}
          >
            ← Back to {LABELS[sport]}
          </button>
        ) : (
          <Link
            href={`/${sport}`}
            className={styles.backButton}
          >
            ← Back to {LABELS[sport]}
          </Link>
        )}

        <div className={styles.utilityActions}>
          <button
            onClick={shareSlate}
            aria-label="Share game slate"
          >
            ↥
          </button>

          <button
            onClick={toggleSaved}
            className={
              saved
                ? styles.savedButton
                : ""
            }
            aria-label="Save game slate"
          >
            ☆
          </button>
        </div>
      </div>

      {activeGame ? (
        <section className={styles.intelligencePage}>
          <ExpandedGame
            sport={sport}
            league={league}
            game={activeGame}
          />
        </section>
      ) : (
        <>
      <section className={styles.slateTitle}>
        <div className={styles.slateTitleIcon}>
          {ICONS[sport]}
        </div>

        <div>
          <h1>
            {LABELS[sport]} Game Slate
          </h1>

          <p>
            {weekNumber
              ? `Week ${weekNumber} · `
              : ""}
            {selectedLabel}
          </p>
        </div>
      </section>

      {dates.length ? (
        <div className={styles.dateStrip}>
          {visibleDatePills.map((date) => {
            const label = shortDay(date);

            return (
              <button
                key={date}
                className={
                  date === selectedDay
                    ? styles.activeDate
                    : ""
                }
                onClick={() =>
                  setSelectedDay(date)
                }
              >
                <strong>{label.dow}</strong>
                <span>{label.date}</span>
              </button>
            );
          })}

          <button
            className={styles.calendarButton}
            aria-label="Available slate dates"
            onClick={() => {
              const next =
                dates.length
                  ? dates[
                      (dateIndex + 1) %
                        dates.length
                    ]
                  : addDay(dateBase, 1);

              if (next) setSelectedDay(next);
            }}
          >
            ▦
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className={styles.state}>
          Loading game slate…
        </div>
      ) : null}

      {error ? (
        <div className={styles.state}>
          {error}
        </div>
      ) : null}

      {!loading &&
      !error &&
      !visibleGames.length ? (
        <div className={styles.state}>
          No games are currently available for this date.
        </div>
      ) : null}

      <section className={styles.daySection}>
        <div className={styles.dayHead}>
          <h2>{selectedLabel}</h2>

          <span>
            {visibleGames.length} game
            {visibleGames.length === 1
              ? ""
              : "s"}
          </span>
        </div>

        <div className={styles.games}>
          {visibleGames.map((game) => {
            const live =
              game.state === "in";
            const final =
              game.state === "post";

            return (
              <article
                className={`${styles.gameCard} ${
                  live ? styles.liveCard : ""
                }`}
                key={game.id}
              >
                <div className={styles.gameMeta}>
                  <strong
                    className={
                      live
                        ? styles.liveText
                        : ""
                    }
                  >
                    {live
                      ? `● LIVE · ${
                          game.status ||
                          "In Progress"
                        }`
                      : final
                        ? "FINAL"
                        : timeLabel(
                            game.date
                          )}
                  </strong>

                  <span>
                    {game.venue ||
                      (final
                        ? "Game complete"
                        : "Venue TBD")}
                  </span>
                </div>

                <div className={styles.compactMatchup}>
                  <div className={styles.compactTeam}>
                    <TeamLogo
                      src={game.awayLogo}
                      name={game.awayTeam}
                    />

                    <span>
                      <b>{game.awayTeam}</b>
                      <small>
                        {game.awayRecord ||
                          game.awayAbbr}
                      </small>
                    </span>

                    {game.state !== "pre" ? (
                      <strong>
                        {game.awayScore ??
                          "—"}
                      </strong>
                    ) : null}
                  </div>

                  <i>@</i>

                  <div className={styles.compactTeam}>
                    <TeamLogo
                      src={game.homeLogo}
                      name={game.homeTeam}
                    />

                    <span>
                      <b>{game.homeTeam}</b>
                      <small>
                        {game.homeRecord ||
                          game.homeAbbr}
                      </small>
                    </span>

                    {game.state !== "pre" ? (
                      <strong>
                        {game.homeScore ??
                          "—"}
                      </strong>
                    ) : null}
                  </div>
                </div>

                <div
                  className={`${styles.propStatus} ${
                    live
                      ? styles.activePropStatus
                      : ""
                  }`}
                >
                  <span>ⓘ</span>
                  {live
                    ? "Player props active · live status updating"
                    : "Player props and rankings available inside Game Intelligence"}
                </div>

                <button
                  className={styles.expandButton}
                  onClick={() =>
                    setOpen(game.id)
                  }
                  aria-expanded={false}
                >
                  View Game Intelligence

                  <span>→</span>
                </button>
              </article>
            );
          })}
        </div>
      </section>

        </>
      )}
    </main>
  );
}
