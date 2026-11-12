"use client";
import {playerCardHistory,historyAverage} from '@/lib/player-card-history';
import {propLineText} from '@/lib/prop-line-format';
import {playerFormInsight} from "@/lib/player-card-analysis";
import {playerMatchupNotes,playerFixtureOpponent} from '@/lib/card-intelligence';
import {useSavedSelection} from '@/components/saved-estimated-ev';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./unified-player-card.module.css";
import {usePlayerChartContext} from "./use-player-chart-context";
import {HeadToHeadChart} from "./head-to-head-chart";
import {RecentChart} from "./recent-player-chart";

type SportKey =
  | "mlb"
  | "nfl"
  | "cfb"
  | "nba"
  | "wnba"
  | "nhl"
  | "soccer"
  | "cbb";

type QueryValue = string | string[] | undefined;
type QueryMap = Record<string, QueryValue>;

type HistoryPoint = {
  value: number;
  date?: string;
  opponent?: string;
};

const LABELS: Record<SportKey, string> = {
  mlb: "MLB",
  nfl: "NFL",
  cfb: "CFB",
  nba: "NBA",
  wnba: "WNBA",
  nhl: "NHL",
  soccer: "Soccer",
  cbb: "CBB",
};

function first(value: QueryValue) {
  return Array.isArray(value)
    ? String(value[0] || "")
    : String(value || "");
}

function finite(value: QueryValue) {
  const raw = first(value);
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number)
    ? number
    : null;
}

function fmt(
  value: number | null,
  digits = 1
) {
  if (value == null) return "—";
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(digits)
    .replace(/\.0$/, "");
}

function initials(name: string) {
  const parts = name
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "SS";
  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${
    parts.at(-1)?.[0] || ""
  }`.toUpperCase();
}

function marketLabel(value: string) {
  if (!value) return "Player Research";

  const labels: Record<string, string> = {
    home_runs: "Home Runs",
    hits: "Hits",
    total_bases: "Total Bases",
    strikeouts: "Strikeouts",
    passing_yards: "Passing Yards",
    rushing_yards: "Rushing Yards",
    receiving_yards: "Receiving Yards",
    receptions: "Receptions",
    tackles: "Tackles",
    tackles_assists: "Tackles + Assists",
    sacks: "Sacks",
    q1_points: "First Quarter Points",
    q1_passing_yards: "First Quarter Passing Yards",
    q1_rushing_yards: "First Quarter Rushing Yards",
    q1_receiving_yards: "First Quarter Receiving Yards",
    anytime_td: "Touchdowns",
    first_td: "First Touchdown",
    points: "Points",
    rebounds: "Rebounds",
    assists: "Assists",
    shots_on_goal: "Shots on Goal",
    goalie_saves: "Goalie Saves",
    shots: "Shots",
    saves: "Saves",
  };

  return (
    labels[value] ||
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) =>
        char.toUpperCase()
      )
  );
}

function historyUrl(
  sport: SportKey,
  playerId: string,
  playerName: string,
  team: string,
  market: string,
  league: string,
  source: string
) {
  if(sport==='nhl'&&source==='espn')return `/api/player-search/history?${new URLSearchParams({id:playerId,market})}`;
  if (
    ["nfl", "cfb", "nba", "wnba", "cbb", "nhl"].includes(sport)
  ) {
    return `/api/${sport}/player/${encodeURIComponent(
      playerId
    )}/history?market=${encodeURIComponent(
      market
    )}`;
  }

  const params = new URLSearchParams({
    sport,
    playerId,
    playerName,
    team,
    market,
    league,
  });

  return `/api/player-history?${params.toString()}`;
}

function defaultResearchMarket(
  sport: SportKey,
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
    if (pos === "RB" || pos === "FB") {
      return "rushing_yards";
    }

    if (pos === "WR" || pos === "TE") {
      return "receiving_yards";
    }

    if (
      [
        "S",
        "FS",
        "SS",
        "CB",
        "DB",
        "LB",
        "ILB",
        "OLB",
        "MLB",
        "DE",
        "DT",
        "DL",
      ].includes(pos)
    ) {
      return "tackles_assists";
    }

    return "anytime_td";
  }

  if (sport === "cfb") {
    if (pos === "QB") return "passing_yards";
    if (pos === "RB" || pos === "FB") {
      return "rushing_yards";
    }

    if (pos === "WR" || pos === "TE") {
      return "receiving_yards";
    }

    return "anytime_td";
  }

  if (
    sport === "nba" ||
    sport === "wnba" ||
    sport === "cbb"
  ) {
    return "points";
  }

  if (sport === "nhl") {
    return pos === "G"
      ? "goalie_saves"
      : "shots_on_goal";
  }

  if (sport === "soccer") {
    return pos === "GK" || pos === "G"
      ? "saves"
      : "shots";
  }

  return "";
}

function Unavailable() {
  return <span className={styles.unavailable} aria-label="Unavailable">—</span>;
}

export function UnifiedPlayerCard({
  sport,
  playerId,
  query,
}: {
  sport: SportKey;
  playerId: string;
  query: QueryMap;
}) {
  const router = useRouter();
  const [span, setSpan] =
    useState<5 | 10 | 20 | "head-to-head">(10);
  const [history, setHistory] =
    useState<HistoryPoint[]>([]);
  const [chartHistory,setChartHistory]=useState<HistoryPoint[]>([]);
  const [fixtureOpponent,setFixtureOpponent]=useState<{name:string;aliases:string[]}|null>(null);
  const [historyLoading, setHistoryLoading] =
    useState(false);
  const [historyLabel, setHistoryLabel] =
    useState("");

  const name =
    first(query.name) || "Player";

  const team =
    first(query.team) || LABELS[sport];

  const matchup = first(query.matchup);
  useEffect(() => {
    const controller = new AbortController();
    setFixtureOpponent(null);
    playerFixtureOpponent(sport, first(query.gameId), playerId, team, first(query.league) || 'eng.1', controller.signal)
      .then(opponent => { if (!controller.signal.aborted) setFixtureOpponent(opponent); });
    return () => controller.abort();
  }, [sport, query.gameId, query.league, playerId, team]);

  const requestedMarket =
    first(query.market);

  const historyCutoff = first(query.gameTime)||first(query.date);
  const chartContext=usePlayerChartContext(sport,playerId,first(query.team),historyCutoff,first(query.source));

  const position =
    first(query.position);

  const researchMarket =
    (requestedMarket && requestedMarket !== "watch" ? requestedMarket : "") ||
    defaultResearchMarket(
      sport,
      position
    );

  const savedEvidence=useSavedSelection(sport,playerId,researchMarket,first(query.gameId)||undefined,first(query.quoteId)||undefined,first(query.forecastAt)||undefined,historyCutoff);
  const savedSelection=savedEvidence.selection;
  const line = savedSelection?.line ?? savedEvidence.forecast?.line ?? finite(query.line);
  const projection = savedEvidence.forecast?.projection ?? null;
  const actual =
    finite(query.actual);

  const gameState =
    first(query.state).toLowerCase();

  const gameStatus =
    first(query.status);

  const image =
    first(query.img);

  const effectivePick = savedSelection?.side || '';
  const edge = line != null && projection != null ? projection - line : null;

  useEffect(() => {
    if (
      !playerId ||
      !researchMarket
    ) {
      setChartHistory([]);
      setHistory([]);
      setHistoryLabel("");
      return;
    }

    const controller =
      new AbortController();

    setChartHistory([]);
    setHistory([]);
    setHistoryLabel("");
    setHistoryLoading(true);

    const historyPath = historyUrl(
        sport,
        playerId,
        name,
        team,
        researchMarket,
        first(query.league)||'eng.1',
        first(query.source)
      );
    const requestUrl = historyPath+(historyCutoff?'&before='+encodeURIComponent(historyCutoff):'');
    fetch(requestUrl, {
        cache: "no-store",
        signal: controller.signal,
      }
    )
      .then((response) =>
        response.ok
          ? response.json()
          : null
      )
      .then((payload) => {
        if (
          !payload ||
          controller.signal.aborted
        ) {
          return;
        }

        setHistoryLabel(
          String(
            payload?.statLabel ||
            marketLabel(researchMarket)
          )
        );

        const points = playerCardHistory(payload,sport,researchMarket,historyCutoff||undefined,first(query.gameId)||undefined);

        setHistory(points.slice(-20));
        setChartHistory(playerCardHistory(payload,sport,researchMarket,historyCutoff||undefined,first(query.gameId)||undefined,true));
      })
      .catch(() => {})
      .finally(() => {
        if (
          !controller.signal.aborted
        ) {
          setHistoryLoading(false);
        }
      });

    return () =>
      controller.abort();
  }, [
    sport,
    playerId,
    name,
    team,
    researchMarket,
    query.league,
    query.source,
    historyCutoff,
    query.gameId,
  ]);

  const recentFive = history.slice(-5);
  const recentAverage = historyAverage(recentFive);
  const stat = historyLabel || marketLabel(researchMarket);
  const formInsight=playerFormInsight(sport,researchMarket,history,stat.toLowerCase());
  const historicalLine = savedSelection?.line ?? savedEvidence.forecast?.line ?? null;
  const matchupNotes = playerMatchupNotes({
    sport, gameId: first(query.gameId), gameTime: historyCutoff, teamName: team, matchup,
    opponentName: fixtureOpponent?.name, opponentAliases: fixtureOpponent?.aliases,
    sportsbookLine: historicalLine, quoteVerified: historicalLine != null,
  }, researchMarket, history);

  const live =
    gameState === "in" ||
    gameState === "live";

  const final =
    gameState === "post" ||
    gameState === "final";

  const result = useMemo(() => {
    if (!final || actual == null || line == null || !effectivePick) {
      return "";
    }

    if (actual === line) return "PUSH";

    const hit =
      effectivePick === "UNDER"
        ? actual < line
        : actual > line;

    return hit ? "HIT" : "MISS";
  }, [final, actual, line, effectivePick]);

  const status = live ? 'Live' : final ? 'Final' : gameStatus ? 'Scheduled' : '';
  const probability = savedSelection && savedEvidence.probabilityText !== '—' ? savedEvidence.probabilityText : '';
  const ev = savedSelection && savedEvidence.evText !== '—' ? savedEvidence.evText : '';
  const hitCount = historicalLine == null ? null : recentFive.filter(point => point.value > historicalLine).length;
  const pushCount = historicalLine == null ? 0 : recentFive.filter(point => point.value === historicalLine).length;
  const showComparison = hitCount != null && recentFive.length > 0 && !/first|anytime/.test(researchMarket);
  const formatOdds = (odds:number) => odds > 0 ? '+' + odds : String(odds);

  return (
    <main className={styles.shell}>
      <button type="button" className={styles.back} onClick={() => router.back()}>← Back to {LABELS[sport]}</button>
      <article className={styles.card} data-live={live}>
        <header className={styles.header}>
          <div className={styles.photo}>{image ? <img src={image} alt="" /> : <span>{initials(name)}</span>}</div>
          <div className={styles.identity}>
            <h1>{name}</h1>
            <p>{[position,team,chartContext?.rookie?'Rookie':'',chartContext?.draftYear?`Drafted ${chartContext.draftYear}`:''].filter(Boolean).join(' · ')}</p>
            {matchup && <p className={styles.fixture}>{matchup}</p>}
            {status && <p className={styles.status}>{status}{gameStatus && gameStatus.toLowerCase() !== status.toLowerCase() ? ' · ' + gameStatus : ''}</p>}
          </div>
          <div className={styles.ev} data-available={Boolean(ev)}><span>EV</span><strong>{ev || <Unavailable />}</strong></div>
        </header>

        <section className={styles.marketSummary} aria-label="Market and prediction">
          <div className={styles.market}>
            <div><span>{stat}</span><strong>{line == null ? <Unavailable /> : `O/U ${propLineText(line)}`}</strong></div>
            <div><span>Sach Prediction</span><strong className={effectivePick === 'OVER' ? styles.over : effectivePick === 'UNDER' ? styles.under : undefined}>
              {effectivePick && line != null ? `${effectivePick} ${propLineText(line)}` : <Unavailable />}
            </strong></div>
            <div><span>Sach Projection</span><strong>{projection == null ? <Unavailable /> : fmt(projection)}</strong></div>
            <div><span>Projection vs line</span><strong>{edge == null ? <Unavailable /> : `${edge > 0 ? '+' : ''}${fmt(edge)}`}</strong></div>
          </div>
          <p className={styles.odds}>{savedSelection ? `${savedSelection.sportsbook} ${formatOdds(savedSelection.odds)} · Saved pregame` : 'Saved pick odds unavailable'}</p>
          <div className={styles.probability}><span>Model probability</span><strong>{probability || <Unavailable />}</strong></div>
          {(live || final) && <p className={styles.odds}>{final ? 'Final' : 'Live'} {stat.toLowerCase()} · {actual == null ? 'Stat unavailable' : fmt(actual)}{result ? ' · ' + result : ''}</p>}
        </section>

        <section className={styles.section}>
          <h2>Player Analysis</h2>
          {recentAverage != null ? <ul className={styles.notes}>
            <li><strong>Recent form</strong><span>{formInsight||`${fmt(recentAverage)} ${stat.toLowerCase()} per game over the last ${recentFive.length} appearances.`}</span></li>
            {showComparison && <li><strong>Last {recentFive.length} at {propLineText(historicalLine)}</strong><span>{hitCount} over · {recentFive.length - hitCount - pushCount} under{pushCount ? ` · ${pushCount} on the line` : ''}.</span></li>}
          </ul> : <p className={styles.muted}>{historyLoading ? 'Loading game history…' : 'Game history unavailable for this market.'}</p>}
        </section>

        <section className={styles.section}>
          <h2>Matchup</h2>
          {matchupNotes.length > 0
            ? <ul className={styles.notes}>{matchupNotes.map(note => <li key={note}>{note}</li>)}</ul>
            : <p className={styles.muted}>{historyLoading ? 'Loading matchup history…' : 'Comparable matchup history unavailable.'}</p>}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>Recent Form</h2>
            <div className={styles.tabs} aria-label="Player history view">
              {([5, 10, 20, "head-to-head"] as const).map(value => <button key={value} type="button" aria-pressed={span===value} onClick={() => setSpan(value)}>{value === "head-to-head" ? "Head-to-Head" : `Last ${value}`}</button>)}
            </div>
          </div>
          {span === "head-to-head" ? <HeadToHeadChart
            key={`${sport}|${playerId}|${researchMarket}|${historyCutoff}|${first(query.gameId)}`}
            sport={sport} league={first(query.league)||'eng.1'} playerId={playerId}
            gameId={first(query.gameId)} gameTime={historyCutoff} team={team} matchup={matchup}
            market={researchMarket} statLabel={stat.toLowerCase()} recent={chartHistory} opponent={fixtureOpponent}
            historyUrl={historyUrl(sport,playerId,name,team,researchMarket,first(query.league)||'eng.1',first(query.source))}
            line={line} />
          : historyLoading && !chartHistory.length ? <p className={styles.muted}>Loading recent form…</p> :
            <RecentChart key={`${playerId}|${researchMarket}|${span}`} points={chartHistory}
              games={chartContext?.games} span={span} rookie={chartContext?.rookie}
              statLabel={stat.toLowerCase()} line={line} projection={projection} liveValue={live ? actual : null} />}
        </section>
      </article>
    </main>
  );
}
