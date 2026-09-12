"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SOCCER_LEAGUES, type SoccerDashboardResponse } from "@/lib/soccer";

function fmtTime(value: string) {
  if (!value) return "Time TBD";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function fmtDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function SoccerGames({ initialLeague = "eng.1" }: { initialLeague?: string }) {
  const [league, setLeague] = useState(initialLeague);
  const [data, setData] = useState<SoccerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/soccer/dashboard?league=${encodeURIComponent(league)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => active && setData(payload))
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [league]);

  const games = useMemo(
    () => (data?.games || []).filter((game) => !game.completed),
    [data],
  );

  return (
    <div className="legacyMlb subpage soccerSubpage">
      <div className="mlbSubTop">
        <Link className="mlbMenu" href="/" aria-label="Open menu">▦⌄</Link>
      </div>

      <div className="subnav">
        <Link href={`/soccer?league=${encodeURIComponent(league)}`}>← Back to Soccer</Link>
      </div>

      <div className="slateHead soccerSlateHead">
        <h2>⚽ Today&apos;s Soccer Games</h2>
        <p>Choose a matchup to open Game Intelligence, lineups and roster details.</p>
      </div>

      <div className="soccerLeagueRow soccerSlateLeague">
        <label>Leagues</label>
        <select value={league} onChange={(event) => setLeague(event.target.value)}>
          {SOCCER_LEAGUES.map(([name, slug]) => (
            <option key={slug} value={slug}>{name}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="origInfo">Loading today&apos;s soccer slate…</div> : null}

      <div className="slateList">
        {games.map((game) => {
          const intel = data?.matchupIntelligence?.find((item) => item.gameId === game.gameId);
          return (
            <article
              className={`gameCard soccerSlateCard ${game.state === "in" ? "live" : ""}`}
              key={game.gameId}
            >
              <div className="gameMeta">
                <strong>{game.state === "in" ? `● LIVE · ${game.status}` : fmtTime(game.kickoff)}</strong>
                <span>{fmtDate(game.kickoff)} · {game.status}</span>
              </div>

              <div className="gameTeam">
                {game.awayLogo ? <img src={game.awayLogo} alt="" /> : <span className="soccerLogoFallback">⚽</span>}
                <div>
                  <strong>{game.awayTeam}</strong>
                  <span>{intel?.playersToWatch?.find((name) => name) || "Roster available"}</span>
                </div>
                <b>{game.state === "in" ? game.awayScore ?? "" : ""}</b>
              </div>

              <div className="gameTeam">
                {game.homeLogo ? <img src={game.homeLogo} alt="" /> : <span className="soccerLogoFallback">⚽</span>}
                <div>
                  <strong>{game.homeTeam}</strong>
                  <span>{intel?.bestProp ? `Best angle: ${intel.bestProp}` : "Roster available"}</span>
                </div>
                <b>{game.state === "in" ? game.homeScore ?? "" : ""}</b>
              </div>

              <Link
                className="viewGame"
                href={`/soccer/games/${game.gameId}?league=${encodeURIComponent(league)}`}
              >
                View {game.awayTeam} @ {game.homeTeam} →
              </Link>
            </article>
          );
        })}
      </div>

      {!loading && !games.length ? (
        <div className="emptyData">No upcoming games were returned for this league.</div>
      ) : null}
    </div>
  );
}
