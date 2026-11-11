"use client";

import { useEffect, useState } from "react";
import { SportLink as Link } from "@/components/sport-link";
import { fetchDashboardSummary } from "@/components/use-dashboard-summary";
import { dashboardDay, VISIBLE_SPORTS, type DashboardSport } from "@/lib/dashboard-contract";
import { visiblePolling } from "@/lib/visible-polling";
import "./home-showcase.css";

type Summary = {
  scheduleAvailable: boolean;
  rankingsAvailable: boolean;
  games: number;
  live: number;
  playerProps: number;
  estimatedPicks: number;
  previewGames?: {
    date: string;
    state: string;
    status?: string;
    awayAbbr: string;
    homeAbbr: string;
    awayLogo?: string;
    homeLogo?: string;
  }[];
};
type SavedPlay = {
  basis: string;
  price: number;
  expectedReturn: number;
  row: {
    playerId: string;
    playerName: string;
    team?: string;
    teamName?: string;
    teamAbbr?: string;
    gameTime: string;
    market: string;
    prediction: string;
    sportsbookLine: number;
    sportsbook: string;
    headshot?: string;
    photoUrl?: string;
    estimatedEv?: { status: string; percent: number | null; side?: string; line?: number; odds?: number; sportsbook?: string };
  };
};
type Featured = { slateDay: string; plays: { key: string; pick: SavedPlay | null }[] };

const gameTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});
const displayTime = (value: string) => Number.isFinite(Date.parse(value))
  ? gameTime.format(new Date(value)) + " ET"
  : "Time TBD";

export default function HomeShowcase() {
  const [summaries, setSummaries] = useState<Partial<Record<DashboardSport, Summary | null>>>({});
  const [featured, setFeatured] = useState<Partial<Record<DashboardSport, Featured | null>>>({});
  const [performance, setPerformance] = useState<{ settled?: number; hits?: number; hitRate?: number; partial?: boolean; success?: boolean }>();
  const [today, setToday] = useState("");

  useEffect(() => {
    let active = true;
    let refreshing = false;
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      if (active) setToday(dashboardDay(new Date()));
      try {
        await Promise.all([
          ...VISIBLE_SPORTS.map(async sport => {
            try {
              const summary = await fetchDashboardSummary(sport);
              if (active) setSummaries(previous => ({ ...previous, [sport]: summary }));
            } catch {
              if (active) setSummaries(previous => ({ ...previous, [sport]: previous[sport] ?? null }));
            }
          }),
          ...VISIBLE_SPORTS.map(async sport => {
            try {
              const response = await fetch(`/api/top-plays?sport=${sport}`, {
                cache: "no-store", signal: AbortSignal.timeout(45_000),
              });
              if (!response.ok) throw new Error("Saved picks unavailable");
              const result: Featured = await response.json();
              if (!Array.isArray(result.plays) || !result.slateDay) throw new Error("Saved picks unavailable");
              if (active) setFeatured(previous => ({ ...previous, [sport]: result }));
            } catch {
              if (active) setFeatured(previous => ({ ...previous, [sport]: previous[sport] ?? null }));
            }
          }),
          fetch("/api/platform-performance", { cache: "no-store", signal: AbortSignal.timeout(45_000) })
            .then(response => response.ok ? response.json() : null)
            .then(result => { if (active && result) setPerformance(result); })
            .catch(() => {}),
        ]);
      } finally {
        refreshing = false;
      }
    }
    void refresh();
    const stop = visiblePolling(refresh, 30_000);
    return () => { active = false; stop(); };
  }, []);

  const available = Object.values(summaries).filter(Boolean);
  const ready = VISIBLE_SPORTS.every(sport => summaries[sport] !== undefined);
  const partial = ready && VISIBLE_SPORTS.some(sport => !summaries[sport]?.scheduleAvailable || !summaries[sport]?.rankingsAvailable);
  const total = (field: "games" | "live" | "playerProps" | "estimatedPicks") =>
    available.reduce((sum, summary) => sum + (Number(summary?.[field]) || 0), 0);
  const teams = new Set<string>();

  return (
    <main className="shRoot">
      <div className="shWrap">
        <section className="shHero shHomeArena">
          <div className="shHeroContent">
            <h1>YOUR <em>GAME.</em><br />OUR INTELLIGENCE.</h1>
            <p>Get a clear read on the slate. Explore matchups, compare player props, and see the numbers behind each Sach Pick.</p>
          </div>
        </section>

        <section className="shIntel">
          <div className="shIntelTitle"><h2>Current Slate Intelligence</h2></div>
          <div className="shStats">
            <div data-metric="games"><span className="shStatHead"><b aria-hidden="true">▦</b>Games</span><strong>{available.length ? total("games") : "—"}</strong><small>{total("live")} live</small></div>
            <div data-metric="props"><span className="shStatHead"><b aria-hidden="true">≋</b>Player Props</span><strong>{available.length ? total("playerProps") : "—"}</strong><small>Verified lines</small></div>
            <div data-metric="picks"><span className="shStatHead"><b aria-hidden="true">◆</b>Sach Picks</span><strong>{available.length ? total("estimatedPicks") : "—"}</strong><small>Featured markets</small></div>
            <div data-metric="results"><span className="shStatHead"><b aria-hidden="true">◎</b>Hit Rate</span><strong>{performance?.settled && typeof performance.hitRate === "number" ? performance.hitRate.toFixed(1) + "%" : "—"}</strong><small>{performance?.settled ? `${performance.hits} / ${performance.settled} graded decisions` : performance?.success ? "No graded results yet" : "Checking overall results"}</small></div>
          </div>
          <p className="ssScopeNote">Overall hit rate · All recorded results · NBA, NFL &amp; NHL</p>
        </section>

        <section className="shPanel shSnapshots">
          <div className="shSectionTitle"><h2>Sport Snapshots</h2></div>
          <div className="shSnapshotList">
            {VISIBLE_SPORTS.map(sport => {
              const summary = summaries[sport];
              return <Link href={`/${sport}`} key={sport} data-sport={sport}>
                <strong className="shSnapshotSport">{sport.toUpperCase()}</strong>
                <span>{summary?.scheduleAvailable ? `${summary.games} games` : summary === undefined ? "Loading games…" : "Games unavailable"}</span>
                <span>{summary?.rankingsAvailable ? `${summary.estimatedPicks} picks` : summary === undefined ? "Loading picks…" : "Picks unavailable"}</span>
                <span className="shSnapshotArrow" aria-hidden="true">›</span>
              </Link>;
            })}
          </div>
        </section>

        <div className="shBottomGrid">
          <section className="shBottomSection">
            <div className="shPanel">
              <div className="shSectionTitle shPanelHeading"><h2>Games</h2></div>
              <div className="shGameList">
                {VISIBLE_SPORTS.map(sport => {
                  const summary = summaries[sport];
                  const games = [...(summary?.previewGames ?? [])].filter(game => game.state !== "post");
                  const game = games.sort((a, b) => Number(b.state === "in") - Number(a.state === "in") || Date.parse(a.date) - Date.parse(b.date))[0];
                  if (!game) return <p className="shHomeEmpty" key={sport}><strong>{sport.toUpperCase()}</strong> {summary === undefined ? "Loading games…" : summary?.scheduleAvailable ? "No upcoming games" : "Schedule unavailable"}</p>;
                  return <Link href={`/${sport}/games`} className="shGame" key={sport}>
                    <div className="shTeam">{game.awayLogo && <img src={game.awayLogo} alt="" />}<b>{game.awayAbbr}</b></div>
                    <span className="shAt">@</span>
                    <div className="shTeam">{game.homeLogo && <img src={game.homeLogo} alt="" />}<b>{game.homeAbbr}</b></div>
                    <div className="shWhen"><b>{sport.toUpperCase()}</b><span>{displayTime(game.date)}</span>{game.state === "in" && <small>{game.status || "Live"}</small>}</div>
                  </Link>;
                })}
              </div>
            </div>
          </section>

          <section className="shBottomSection">
            <div className="shPanel">
              <div className="shSectionTitle shPanelHeading"><h2>Current Sach Picks</h2></div>
              <div className="shPredList">
                {VISIBLE_SPORTS.map(sport => {
                  const slate = featured[sport];
                  const play = ["play", "value", "long"]
                    .map(category => slate?.plays.find(card => card.key === category)?.pick)
                    .find(pick => pick?.basis === "model" && Number.isFinite(pick.expectedReturn) && pick.expectedReturn > 0);
                  const row = play?.row;
                  const team = row?.teamName || row?.team || row?.teamAbbr;
                  const teamKey = team?.toLowerCase().replace(/[^a-z0-9]/g, "");
                  if (!slate || play?.basis !== "model" || !row || !teamKey || teams.has(teamKey) || (today && slate.slateDay < today)) {
                    const nextGame = [...(summaries[sport]?.previewGames ?? [])]
                      .filter(game => game.state === "pre" && Date.parse(game.date) > Date.now())
                      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
                    return <div className="shHomeEmpty shPickStatus" key={sport} data-sport={sport}>
                      <strong>{sport.toUpperCase()}</strong>
                      <span>{slate === undefined ? "Checking saved picks…" : slate === null ? "Saved picks unavailable" : "Awaiting a qualified pick"}
                        {nextGame && <small>{nextGame.awayAbbr} @ {nextGame.homeAbbr} · {displayTime(nextGame.date)}</small>}
                      </span>
                    </div>;
                  }
                  teams.add(teamKey);
                  const photo = row.headshot || row.photoUrl;
                  const ev = row.estimatedEv;
                  const verifiedEv = ev?.status === "available" && typeof ev.percent === "number" &&
                    Number.isFinite(ev.percent) && ev.side === row.prediction &&
                    ev.line === row.sportsbookLine && ev.odds === play.price && ev.sportsbook === row.sportsbook
                    ? ev.percent : null;
                  return <Link className="shPredictionRow" href={`/${sport}`} key={sport} data-sport={sport}>
                    {photo && <img src={photo} alt="" />}
                    <span className="shPlayerDetails">
                      <strong>{row.playerName}</strong>
                      <small>{sport.toUpperCase()} · {team} · {row.market.replaceAll("_", " ")}</small>
                      <small>{row.prediction} {row.sportsbookLine} · Saved at {row.sportsbook} {play.price > 0 ? "+" : ""}{play.price}</small>
                      {today && slate.slateDay > today && <small>Next slate · {displayTime(row.gameTime)}</small>}
                    </span>
                    {verifiedEv !== null && <span className={`shPickEv ${verifiedEv > 0 ? "shPositiveEv" : ""}`}>
                      EV {verifiedEv > 0 ? "+" : ""}{verifiedEv.toFixed(1)}%
                    </span>}
                  </Link>;
                })}
              </div>
            </div>
          </section>
        </div>
        <footer className="shFooter">© SACH SPORTS · THE INTELLIGENCE EDGE</footer>
      </div>
    </main>
  );
}
