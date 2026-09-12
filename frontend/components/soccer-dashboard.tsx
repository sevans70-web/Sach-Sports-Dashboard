"use client";
import { useEffect, useState } from "react";
import {
  SOCCER_LEAGUES,
  SOCCER_MARKETS,
  type SoccerDashboardResponse,
  type SoccerMarketKey,
  type SoccerRanking,
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
        <div className="origMatch">
          {row.team} · {row.matchup}
        </div>
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
            <article>
              <span>Recent Avg</span>
              <strong>{row.avgMetric.toFixed(2)}</strong>
            </article>
            <article>
              <span>Avg Minutes</span>
              <strong>{Math.round(row.avgMinutes)}</strong>
            </article>
            <article>
              <span>Start Rate</span>
              <strong>{Math.round(row.startRate * 100)}%</strong>
            </article>
          </div>
          <details open>
            <summary>Why this player?</summary>
            <p>
              {row.why}. Ranking blends recent production, expected minutes, starter
              frequency, sample quality and the upcoming fixture.
            </p>
          </details>
        </div>
      ) : null}
    </article>
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
  const liveGames = data.games.filter((g) => g.state === "in");
  const rows = data.rankings?.[market] || [];
  const active = SOCCER_MARKETS.find((x) => x[0] === market)!;

  // Highlight a small number of current fixtures instead of duplicating the full schedule.
  const featured = [...upcoming]
    .sort((a, b) => {
      const popular = /Liverpool|Arsenal|Chelsea|Manchester|Tottenham|Barcelona|Real Madrid|Bayern|PSG|Inter|Milan|Juventus/i;
      const aScore = (popular.test(a.homeTeam) ? 1 : 0) + (popular.test(a.awayTeam) ? 1 : 0);
      const bScore = (popular.test(b.homeTeam) ? 1 : 0) + (popular.test(b.awayTeam) ? 1 : 0);
      return bScore - aScore || String(a.kickoff).localeCompare(String(b.kickoff));
    })
    .slice(0, 3);

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
          }}
        >
          {SOCCER_LEAGUES.map(([name, slug]) => (
            <option value={slug} key={slug}>
              {name}
            </option>
          ))}
        </select>
      </section>

      <div className="origUpdated">Updated {data.updatedAt ? fmtTime(data.updatedAt) : "—"}</div>

      <button className="origGamesEntry soccerGamesEntry" onClick={() => setShowGames((v) => !v)}>
        <strong>⚽ TODAY&apos;S SOCCER GAMES</strong>
        <span>› Open today&apos;s game cards, teams &amp; roster access</span>
      </button>

      {showGames ? (
        <section className="soccerSlate">
          {upcoming.map((g) => (
            <article className={`soccerFullGameCard ${g.state === "in" ? "live" : ""}`} key={g.gameId}>
              <button
                className="soccerGameMain"
                onClick={() => setOpenGame(openGame === g.gameId ? null : g.gameId)}
              >
                <div>
                  <strong>{g.awayTeam} @ {g.homeTeam}</strong>
                  <span>{fmtTime(g.kickoff)}</span>
                </div>
                <b>{g.status}</b>
              </button>
              {openGame === g.gameId ? (
                <div className="soccerGameIntel">
                  <div className="soccerTeamAccess">
                    <button>{g.awayTeam} Roster</button>
                    <button>{g.homeTeam} Roster</button>
                  </div>
                  <p>
                    Game intelligence opens here. Team roster access is attached to each game
                    card so the slate does not remain permanently expanded on the home screen.
                  </p>
                </div>
              ) : null}
            </article>
          ))}
          {!loading && !upcoming.length ? <div className="origInfo">No upcoming games are available.</div> : null}
        </section>
      ) : null}

      <section className="origSnapshot">
        <div className="snapshotTitleRow">
          <h2>Game Lineup Alerts</h2>
          <p>{leagueName}</p>
        </div>
        <div className="origMetrics snapshot">
          <article className="green">
            <span>Confirmed Lineups</span>
            <strong>0</strong>
            <small>updates near kickoff</small>
          </article>
          <article>
            <span>Key Player Alerts</span>
            <strong>0</strong>
            <small>out · doubtful · limited</small>
          </article>
          <article className="gold">
            <span>Lineup Changes</span>
            <strong>0</strong>
            <small>late changes &amp; rotation alerts</small>
          </article>
        </div>
      </section>

      <section className="origSection soccerMatchup">
        <h2>🔥 Matchup Intelligence</h2>
        <p className="soccerSectionSub">Featured and high-interest games from the selected league.</p>
        {featured.map((g) => (
          <article className={`soccerGameCard ${g.state === "in" ? "live" : ""}`} key={g.gameId}>
            <div>
              <strong>{g.awayTeam} @ {g.homeTeam}</strong>
              <span>{fmtTime(g.kickoff)}</span>
            </div>
            <b>{g.status}</b>
          </article>
        ))}
      </section>

      <section className="origSection performance">
        <h2>📊 Prediction Performance</h2>
        <details>
          <summary>ⓘ How performance is measured</summary>
          <div className="origExplain">
            <p>
              Soccer performance is graded from predictions generated before kickoff. Overall
              results and each individual prop category are tracked separately.
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
            Ranked by Soccer GI Score using recent production, expected minutes, starting
            reliability, sample quality and upcoming matchup context.
          </p>
        </div>

        <div className="origCards">
          {rows.slice(0, showFull ? 25 : 5).map((r) => (
            <RankCard key={`${market}-${r.playerId}-${r.rank}`} row={r} market={market} />
          ))}
          {!loading && !rows.length ? (
            <div className="origEmpty">
              No eligible {active[2]} rankings are available yet for this slate.
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
