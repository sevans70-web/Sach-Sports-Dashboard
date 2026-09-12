"use client";

import { useEffect, useState } from "react";
import {
  SOCCER_LEAGUES,
  SOCCER_MARKETS,
  type SoccerDashboardResponse,
  type SoccerMarketKey,
  type SoccerRanking,
  type SoccerRosterPlayer,
} from "@/lib/soccer";

const empty: SoccerDashboardResponse = {
  success: false,
  league: "eng.1",
  leagueSlug: "eng.1",
  updatedAt: "",
  games: [],
  rankings: {
    shots_on_target: [],
    shots: [],
    saves: [],
    goals: [],
    assists: [],
  },
  matchupIntelligence: [],
  playersTracked: 0,
};

function fmtTime(v: string) {
  if (!v) return "Time TBD";
  return (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(v)) + " ET"
  );
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0]?.slice(0, 2) || "SC").toUpperCase();
}

function pct(v: number) {
  return `${Math.round(Number(v || 0))}%`;
}

function RankCard({ row, market }: { row: SoccerRanking; market: SoccerMarketKey }) {
  const [open, setOpen] = useState(false);
  const unit =
    market === "saves" ? "saves" : market === "shots_on_target" ? "SOT" : market;

  return (
    <article className={`origRankCard soccerRankCard ${open ? "expanded" : ""}`}>
      <div className="origRank">
        #{row.rank}
        <span>−</span>
      </div>

      <div className="origPhotoWrap">
        {row.photoUrl ? (
          <img className="origHeadshot" src={row.photoUrl} alt="" />
        ) : (
          <div className="soccerAvatarFallback">{initials(row.playerName)}</div>
        )}
      </div>

      <div className="origRankBody">
        <strong className="origName">{row.playerName}</strong>
        <div className="origMatch">{row.team} · {row.matchup}</div>
        <div className="origProp">
          <b>Projection:</b> {row.projection.toFixed(2)} {unit}
        </div>
        <div className="origProp">
          <b>Probability:</b> {pct(row.modelProbability)} over {row.modelTarget}
        </div>
        <p>{row.why}</p>
        <div className="soccerStatus">
          {row.availability} · {Math.round(row.expectedMinutes)} expected min
        </div>
      </div>

      <div className="origGi">
        <small>GI SCORE</small>
        <strong>{row.giScore.toFixed(1)}</strong>
      </div>

      <button className="origIntel soccerIntelButton" onClick={() => setOpen((v) => !v)}>
        {open ? "Close Intelligence" : "View Intelligence"}
      </button>

      {open ? (
        <div className="origInlineIntel">
          <div className="intelKpis">
            <article><span>Recent Avg</span><strong>{row.avgMetric.toFixed(2)}</strong></article>
            <article><span>Avg Minutes</span><strong>{Math.round(row.avgMinutes)}</strong></article>
            <article><span>Start Rate</span><strong>{Math.round(row.startRate * 100)}%</strong></article>
          </div>
          <details open>
            <summary>Why this player?</summary>
            <p>
              {row.why}. The GI score also considers expected minutes, starting reliability
              and the upcoming matchup.
            </p>
          </details>
        </div>
      ) : null}
    </article>
  );
}

function RosterPanel({
  league,
  teamId,
  teamName,
}: {
  league: string;
  teamId: string;
  teamName: string;
}) {
  const [players, setPlayers] = useState<SoccerRosterPlayer[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setPlayers(null);
    setError("");

    fetch(`/api/soccer/roster?league=${encodeURIComponent(league)}&teamId=${encodeURIComponent(teamId)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((payload) => {
        if (!live) return;
        if (!payload?.success) {
          setError(payload?.error || "Roster unavailable.");
          setPlayers([]);
          return;
        }
        setPlayers(payload.players || []);
      })
      .catch(() => {
        if (live) {
          setError("Roster unavailable.");
          setPlayers([]);
        }
      });

    return () => {
      live = false;
    };
  }, [league, teamId]);

  if (players === null) return <div className="soccerRosterState">Loading {teamName} roster…</div>;
  if (error) return <div className="soccerRosterState">{error}</div>;
  if (!players.length) return <div className="soccerRosterState">No roster players returned.</div>;

  return (
    <div className="soccerRosterGrid">
      {players.map((player) => (
        <article className="soccerRosterPlayer" key={player.playerId || player.playerName}>
          <div className="soccerRosterPhoto">
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

export function SoccerDashboard() {
  const [league, setLeague] = useState("eng.1");
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [market, setMarket] = useState<SoccerMarketKey>("shots_on_target");
  const [showFull, setShowFull] = useState(false);
  const [period, setPeriod] = useState("Today");
  const [showGames, setShowGames] = useState(false);
  const [openGame, setOpenGame] = useState<string | null>(null);
  const [openRoster, setOpenRoster] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);

    fetch(`/api/soccer/dashboard?league=${encodeURIComponent(league)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((v) => live && setData(v))
      .catch(() => live && setData(empty))
      .finally(() => live && setLoading(false));

    return () => {
      live = false;
    };
  }, [league]);

  const leagueName = SOCCER_LEAGUES.find((x) => x[1] === league)?.[0] || "Soccer";
  const upcoming = data.games.filter((g) => !g.completed);
  const rows = data.rankings?.[market] || [];
  const active = SOCCER_MARKETS.find((x) => x[0] === market)!;

  return (
    <div className="origMlb soccerDashboard">
      <section className="origHero soccerHero">
        <h1>Soccer Intelligence Center</h1>
        <p>
          Start with the strongest players in each market, review the reason behind every
          ranking, and open the full Top 25 only when you need more depth.
        </p>
      </section>

      <section className="soccerLeagueRow">
        <label>Leagues</label>
        <select
          value={league}
          onChange={(e) => {
            setLeague(e.target.value);
            setShowFull(false);
            setShowGames(false);
            setOpenGame(null);
            setOpenRoster(null);
          }}
        >
          {SOCCER_LEAGUES.map(([name, slug]) => (
            <option value={slug} key={slug}>{name}</option>
          ))}
        </select>
      </section>

      <div className="origUpdated">
        Updated {data.updatedAt ? fmtTime(data.updatedAt) : "—"}
      </div>

      <button className="origGamesEntry soccerGamesEntry" onClick={() => setShowGames((v) => !v)}>
        <strong>⚽ TODAY&apos;S SOCCER GAMES</strong>
        <span>› Open today&apos;s game cards, intelligence &amp; team rosters</span>
      </button>

      {showGames ? (
        <section className="soccerSlate">
          {upcoming.map((g) => {
            const open = openGame === g.gameId;
            return (
              <article className={`soccerFullGameCard ${g.state === "in" ? "live" : ""}`} key={g.gameId}>
                <button
                  className="soccerGameMain"
                  onClick={() => {
                    setOpenGame(open ? null : g.gameId);
                    setOpenRoster(null);
                  }}
                >
                  <div className="soccerGameTeams">
                    {g.awayLogo ? <img src={g.awayLogo} alt="" /> : null}
                    <strong>{g.awayTeam} @ {g.homeTeam}</strong>
                    {g.homeLogo ? <img src={g.homeLogo} alt="" /> : null}
                    <span>{fmtTime(g.kickoff)}</span>
                  </div>
                  <b>{g.status}</b>
                </button>

                {open ? (
                  <div className="soccerGameIntel">
                    <h4>Game Intelligence</h4>
                    {(() => {
                      const intel = data.matchupIntelligence.find((item) => item.gameId === g.gameId);
                      if (!intel) {
                        return <p>Player intelligence will populate as the engine confirms eligible recent form and lineup context.</p>;
                      }
                      return (
                        <>
                          <p>{intel.reason}</p>
                          <div className="soccerGameIntelKpis">
                            <span><b>Best prop angle:</b> {intel.bestProp}</span>
                            <span><b>Ranked players:</b> {intel.rankedPlayers}</span>
                            <span>
                              <b>Players to watch:</b>{" "}
                              {intel.playersToWatch.length ? intel.playersToWatch.join(", ") : "Pending"}
                            </span>
                          </div>
                        </>
                      );
                    })()}

                    <div className="soccerTeamAccess">
                      <button
                        className={openRoster === g.awayTeamId ? "active" : ""}
                        onClick={() => setOpenRoster(openRoster === g.awayTeamId ? null : g.awayTeamId)}
                      >
                        {g.awayTeam} Roster
                      </button>
                      <button
                        className={openRoster === g.homeTeamId ? "active" : ""}
                        onClick={() => setOpenRoster(openRoster === g.homeTeamId ? null : g.homeTeamId)}
                      >
                        {g.homeTeam} Roster
                      </button>
                    </div>

                    {openRoster === g.awayTeamId ? (
                      <RosterPanel league={league} teamId={g.awayTeamId} teamName={g.awayTeam} />
                    ) : null}
                    {openRoster === g.homeTeamId ? (
                      <RosterPanel league={league} teamId={g.homeTeamId} teamName={g.homeTeam} />
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      <section className="origSnapshot">
        <div className="snapshotTitleRow">
          <h2>Game Lineup Alerts</h2>
          <p>{leagueName}</p>
        </div>
        <div className="origMetrics snapshot">
          <article className="green">
            <span>Confirmed Lineups</span><strong>0</strong><small>updates near kickoff</small>
          </article>
          <article>
            <span>Key Player Alerts</span><strong>0</strong><small>out · doubtful · limited</small>
          </article>
          <article className="gold">
            <span>Lineup Changes</span><strong>0</strong><small>late changes &amp; rotation alerts</small>
          </article>
        </div>
      </section>

      <section className="origSection soccerMatchup">
        <h2>🔥 Matchup Intelligence</h2>
        <p className="soccerSectionSub">
          Featured games are selected because the engine sees stronger player-prop signals,
          a concentration of ranked players, or a high-interest matchup.
        </p>

        {data.matchupIntelligence.map((intel) => (
          <article className="soccerMatchupIntelCard" key={intel.gameId}>
            <div className="soccerMatchupIntelTop">
              <div>
                <strong>{intel.matchup}</strong>
                <span>{fmtTime(intel.kickoff)}</span>
              </div>
              <b>{intel.status}</b>
            </div>
            <h4>Why this matchup matters</h4>
            <p>{intel.reason}</p>
            <div className="soccerMatchupTags">
              <span>Best angle: {intel.bestProp}</span>
              <span>{intel.rankedPlayers} ranked players</span>
              {intel.playersToWatch.length ? (
                <span>Watch: {intel.playersToWatch.join(" · ")}</span>
              ) : null}
            </div>
          </article>
        ))}

        {!loading && !data.matchupIntelligence.length ? (
          <div className="origInfo">
            Matchup intelligence will populate when the engine confirms eligible player data.
          </div>
        ) : null}
      </section>

      <section className="origSection performance">
        <h2>📊 Prediction Performance</h2>
        <details>
          <summary>ⓘ How performance is measured</summary>
          <div className="origExplain">
            <p>
              Soccer performance is graded from predictions generated before kickoff.
              Overall results and each prop category are tracked separately.
            </p>
          </div>
        </details>

        <h3>🌐 Overall Soccer Performance</h3>
        <div className="origPeriods">
          {["Today", "Yesterday", "Week", "Month", "Season"].map((x) => (
            <button key={x} className={period === x ? "active" : ""} onClick={() => setPeriod(x)}>
              {x}
            </button>
          ))}
        </div>

        <div className="origMetrics">
          <article className="green"><span>Hit Rate</span><strong>—</strong></article>
          <article><span>Correct / Settled</span><strong>0 / 0</strong></article>
          <article className="gold"><span>Pending</span><strong>0</strong></article>
        </div>

        <div className="origTabs markets soccerPerformanceMarkets">
          {SOCCER_MARKETS.map(([key, icon, label]) => (
            <button key={key} className={market === key ? "active" : ""} onClick={() => setMarket(key)}>
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="origMetrics soccerPropPerformance">
          <article className="green"><span>Hits / Predictions</span><strong>0 / 0</strong></article>
          <article><span>Pending</span><strong>0</strong></article>
          <article className="gold"><span>Settled</span><strong>0</strong></article>
          <article><span>Hit Rate</span><strong>—</strong></article>
        </div>

        <div className="soccerPerfNote">Results will appear after games are graded.</div>
      </section>

      <section className="origSection rankings">
        <div className="origRankingsHeader">
          <h2>Player Rankings</h2>
          <p>Market-specific intelligence · upcoming matchup context</p>
        </div>

        <div className="origTabs markets soccerMarkets">
          {SOCCER_MARKETS.map(([key, icon, label]) => (
            <button
              key={key}
              className={market === key ? "active" : ""}
              onClick={() => {
                setMarket(key);
                setShowFull(false);
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="origMarketHead">
          <h2>{active[1]} {active[2]} Rankings</h2>
          <p>
            Ranked by Soccer GI Score using recent production, expected minutes,
            starting reliability, sample quality and upcoming matchup context.
          </p>
        </div>

        <div className="origCards">
          {rows.slice(0, showFull ? 25 : 5).map((r) => (
            <RankCard key={`${market}-${r.playerId}-${r.rank}`} row={r} market={market} />
          ))}

          {!loading && !rows.length ? (
            <div className="origEmpty">
              No eligible {active[2]} rankings were returned for this slate.
            </div>
          ) : null}

          {loading ? <div className="origInfo">Loading {leagueName} player intelligence…</div> : null}
        </div>

        {rows.length > 5 ? (
          <button className="viewFullTop25" onClick={() => setShowFull((v) => !v)}>
            {showFull ? "Show Top 5 Only" : "View Full Top 25"}
          </button>
        ) : null}
      </section>
    </div>
  );
}
