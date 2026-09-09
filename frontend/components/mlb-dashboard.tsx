"use client";

import { useState } from "react";

const hrViews = ["Live HR", "Yesterday", "Emerging Power"] as const;
const batterMarkets = [
  ["🔥", "Home Runs"], ["⚾", "Hits"], ["💥", "Total Bases"], ["🏃", "Runs"],
  ["🎯", "RBIs"], ["👁️", "Walks"], ["💨", "Stolen Bases"], ["📊", "H+R+RBI"],
] as const;
const periods = ["Today", "Yesterday", "7 Day", "Monthly", "Season"] as const;

const samplePlayers = [
  { rank: 1, name: "Player rankings connect in data phase", team: "MLB", gi: "—", probability: "—" },
  { rank: 2, name: "Current MLB ranking engine preserved", team: "MLB", gi: "—", probability: "—" },
  { rank: 3, name: "No ranking logic changed", team: "MLB", gi: "—", probability: "—" },
];

export function MlbDashboard() {
  const [hrView, setHrView] = useState<(typeof hrViews)[number]>("Live HR");
  const [playerType, setPlayerType] = useState<"Batter" | "Pitcher">("Batter");
  const [market, setMarket] = useState("Home Runs");
  const [period, setPeriod] = useState<(typeof periods)[number]>("Today");

  return (
    <>
      <section className="mlbHero">
        <h1>MLB Intelligence Center</h1>
        <p>Start with the strongest players in each market, review the reason behind every ranking, and open the full Top 25 only when you need more depth.</p>
      </section>
      <div className="mlbUpdated">Updated live from MLB intelligence</div>

      <button className="mlbGamesEntry" type="button">
        <strong>⚾ TODAY&apos;S MLB GAMES</strong>
        <span>› Open today&apos;s slate, lineups &amp; Game Intelligence</span>
      </button>

      <section className="mlbSnapshot">
        <div className="mlbSectionHeading"><strong>Today&apos;s MLB Snapshot</strong><span>Always confirm starting lineups</span></div>
        <div className="mlbSnapshotGrid">
          <article className="emerald"><span>GAMES</span><strong>—</strong><small>Live schedule connects in data phase</small></article>
          <article><span>LINEUPS</span><strong>—/—</strong><small>Lineup feed pending connection</small></article>
          <article className="gold"><span>ALERTS</span><strong>—</strong><small>Weather intelligence preserved</small></article>
        </div>
      </section>

      <section className="mlbBlock">
        <h2>🔥 HR Intelligence</h2>
        <div className="mlbSegmented" role="tablist" aria-label="HR Intelligence view">
          {hrViews.map((view) => <button key={view} className={hrView === view ? "active" : ""} onClick={() => setHrView(view)}>{view}</button>)}
        </div>
        <div className="mlbIntelPanel">
          <div><span className="mlbLabel">{hrView}</span><h3>{hrView === "Emerging Power" ? "Emerging Power · low-HR & limited-sample hitters" : `${hrView} Intelligence`}</h3></div>
          <p>{hrView === "Emerging Power" ? "Evidence-backed upside only — a player is never included simply because they are due." : "The existing MLB intelligence feed connects here without changing this layout."}</p>
        </div>
      </section>

      <section className="mlbPerformance mlbBlock">
        <div className="mlbSectionHeading"><strong>Prediction Performance</strong><span>Track MLB prop results by period</span></div>
        <div className="mlbPeriodRow">{periods.map((item) => <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div>
        <div className="mlbPerformanceGrid">
          <article><span>SETTLED</span><strong>—</strong><small>{period}</small></article>
          <article><span>HITS</span><strong>—</strong><small>Graded results</small></article>
          <article><span>HIT RATE</span><strong>—</strong><small>All tracked markets</small></article>
        </div>
      </section>

      <section className="mlbRankings mlbBlock">
        <div className="mlbSectionHeading"><strong>Player Rankings</strong><span>Market-specific intelligence · live matchup context</span></div>
        <div className="mlbPrimaryTabs">
          <button className={playerType === "Batter" ? "active" : ""} onClick={() => setPlayerType("Batter")}>🥎 Batter</button>
          <button className={playerType === "Pitcher" ? "active" : ""} onClick={() => setPlayerType("Pitcher")}>⚾ Pitcher</button>
        </div>

        {playerType === "Batter" ? (
          <>
            <div className="mlbMarketTabs">{batterMarkets.map(([icon, name]) => <button key={name} className={market === name ? "active" : ""} onClick={() => setMarket(name)}>{icon} {name}</button>)}</div>
            <div className="mlbRankingTitle"><div><span>{batterMarkets.find(([, name]) => name === market)?.[0]}</span><div><small>TOP MLB</small><h3>{market}</h3></div></div><button>View Top 25</button></div>
            <div className="mlbPlayerList">{samplePlayers.map((player) => <article className="mlbPlayerCard" key={player.rank}><div className="rank">#{player.rank}</div><div className="avatar">⚾</div><div className="identity"><strong>{player.name}</strong><span>{player.team} · Lineup Pending</span></div><div className="score"><small>GI SCORE</small><strong>{player.gi}</strong></div><div className="prob"><small>PROBABILITY</small><strong>{player.probability}</strong></div><button className="intelButton">ⓘ View Intelligence</button></article>)}</div>
          </>
        ) : (
          <div className="mlbIntelPanel"><span className="mlbLabel">PITCHER</span><h3>Pitcher Rankings</h3><p>The existing MLB pitcher rankings component connects here in the data migration phase.</p></div>
        )}
      </section>

      <footer className="mlbFooter">Sach Sports Dashboard · MLB Intelligence</footer>
    </>
  );
}
