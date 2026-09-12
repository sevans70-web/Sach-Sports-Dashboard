"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  SoccerDashboardResponse,
  SoccerRosterPlayer,
  SoccerRosterResponse,
} from "@/lib/soccer";

function fmtDateTime(value: string) {
  if (!value) return "Time TBD";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function initials(name: string) {
  const pieces = name.trim().split(/\s+/);
  return (pieces.length > 1
    ? pieces[0][0] + pieces[pieces.length - 1][0]
    : pieces[0]?.slice(0, 2) || "SC"
  ).toUpperCase();
}

function PlayerList({ players }: { players: SoccerRosterPlayer[] }) {
  return (
    <div className="soccerGameRosterList">
      {players.map((player) => (
        <article key={player.playerId || player.playerName} className="soccerGameRosterRow">
          <div className="soccerGameRosterPhoto">
            {player.photoUrl ? <img src={player.photoUrl} alt="" /> : <span>{initials(player.playerName)}</span>}
          </div>
          <div>
            <strong>{player.playerName}</strong>
            <small>
              {player.position || "Player"}{player.jersey ? ` · #${player.jersey}` : ""}
            </small>
          </div>
        </article>
      ))}
    </div>
  );
}

export function SoccerGame({
  gameId,
  league,
}: {
  gameId: string;
  league: string;
}) {
  const [dashboard, setDashboard] = useState<SoccerDashboardResponse | null>(null);
  const [awayRoster, setAwayRoster] = useState<SoccerRosterResponse | null>(null);
  const [homeRoster, setHomeRoster] = useState<SoccerRosterResponse | null>(null);
  const [team, setTeam] = useState<"away" | "home">("away");

  useEffect(() => {
    let active = true;
    fetch(`/api/soccer/dashboard?league=${encodeURIComponent(league)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => active && setDashboard(payload))
      .catch(() => active && setDashboard(null));
    return () => {
      active = false;
    };
  }, [league]);

  const game = useMemo(
    () => dashboard?.games?.find((item) => item.gameId === gameId) || null,
    [dashboard, gameId],
  );

  const intel = useMemo(
    () => dashboard?.matchupIntelligence?.find((item) => item.gameId === gameId) || null,
    [dashboard, gameId],
  );

  useEffect(() => {
    if (!game) return;
    let active = true;

    Promise.all([
      fetch(`/api/soccer/roster?league=${encodeURIComponent(league)}&teamId=${encodeURIComponent(game.awayTeamId)}`, {
        cache: "no-store",
      }).then((response) => response.json()),
      fetch(`/api/soccer/roster?league=${encodeURIComponent(league)}&teamId=${encodeURIComponent(game.homeTeamId)}`, {
        cache: "no-store",
      }).then((response) => response.json()),
    ])
      .then(([away, home]) => {
        if (!active) return;
        setAwayRoster(away);
        setHomeRoster(home);
      })
      .catch(() => {
        if (!active) return;
        setAwayRoster({ success: false, teamId: game.awayTeamId, teamName: game.awayTeam, players: [] });
        setHomeRoster({ success: false, teamId: game.homeTeamId, teamName: game.homeTeam, players: [] });
      });

    return () => {
      active = false;
    };
  }, [game, league]);

  if (!dashboard || !game) {
    return (
      <div className="legacyMlb subpage soccerSubpage">
        <div className="mlbSubTop">
          <Link className="mlbMenu" href="/" aria-label="Open menu">▦⌄</Link>
        </div>
        <div className="subnav">
          <Link href={`/soccer/games?league=${encodeURIComponent(league)}`}>← Back to Soccer Games</Link>
        </div>
        <p>Loading Game Intelligence…</p>
      </div>
    );
  }

  const roster = team === "away" ? awayRoster : homeRoster;
  const selectedTeam = team === "away" ? game.awayTeam : game.homeTeam;

  return (
    <div className="legacyMlb subpage soccerSubpage">
      <div className="mlbSubTop">
        <Link className="mlbMenu" href="/" aria-label="Open menu">▦⌄</Link>
      </div>

      <div className="subnav">
        <Link href={`/soccer/games?league=${encodeURIComponent(league)}`}>← Back to Soccer Games</Link>
      </div>

      <h1 className="gameTitle">⚽ Game Intelligence</h1>

      <article className={`gameCard intelligence soccerGameIntelligence ${game.state === "in" ? "live" : ""}`}>
        <div className="gameMeta">
          <strong>{game.state === "in" ? `● LIVE · ${game.status}` : game.status}</strong>
          <span>{fmtDateTime(game.kickoff)}</span>
        </div>

        <div className="gameTeam">
          {game.awayLogo ? <img src={game.awayLogo} alt="" /> : <span className="soccerLogoFallback">⚽</span>}
          <div>
            <strong>{game.awayTeam}</strong>
            <span>{awayRoster?.players?.length ? `${awayRoster.players.length} players available` : "Roster loading"}</span>
          </div>
          <b>{game.state === "in" || game.completed ? game.awayScore ?? "" : ""}</b>
        </div>

        <div className="gameTeam">
          {game.homeLogo ? <img src={game.homeLogo} alt="" /> : <span className="soccerLogoFallback">⚽</span>}
          <div>
            <strong>{game.homeTeam}</strong>
            <span>{homeRoster?.players?.length ? `${homeRoster.players.length} players available` : "Roster loading"}</span>
          </div>
          <b>{game.state === "in" || game.completed ? game.homeScore ?? "" : ""}</b>
        </div>
      </article>

      <section className="soccerGameWhy">
        <h2>Matchup Intelligence</h2>
        <h4>Why this matchup matters</h4>
        <p>
          {intel?.reason ||
            "The engine is waiting for enough confirmed player and recent-form data to generate a matchup-specific angle."}
        </p>
        <div className="soccerMatchupTags">
          <span>Best angle: {intel?.bestProp || "Pending"}</span>
          <span>{intel?.rankedPlayers || 0} ranked players</span>
          <span>
            Players to watch: {intel?.playersToWatch?.length ? intel.playersToWatch.join(" · ") : "Pending"}
          </span>
        </div>
      </section>

      <h2 className="lineupTitle">Team Rosters / Lineup Watch</h2>
      <div className="legacyTabs top">
        <button className={team === "away" ? "active" : ""} onClick={() => setTeam("away")}>
          {game.awayTeam}
        </button>
        <button className={team === "home" ? "active" : ""} onClick={() => setTeam("home")}>
          {game.homeTeam}
        </button>
      </div>

      <h3 className="teamGold">{selectedTeam}</h3>
      <span className="confirmed">ROSTER AVAILABLE · LINEUP PENDING</span>

      {!roster ? <div className="emptyData">Loading roster…</div> : null}
      {roster && !roster.success ? (
        <div className="emptyData">{roster.error || "Roster unavailable from source."}</div>
      ) : null}
      {roster?.success && roster.players.length ? <PlayerList players={roster.players} /> : null}
      {roster?.success && !roster.players.length ? (
        <div className="emptyData">No roster players were returned by the source.</div>
      ) : null}
    </div>
  );
}
