"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BATTER_MARKETS, PITCHER_MARKETS, playerHeadshot, rankingName, rankingPlayerId, numberValue, percentValue, type RankingRow } from "@/lib/mlb";

type ScheduleResponse = { success: boolean; games: any[]; fetchedAt?: string; error?: string };
type RankingResponse = { success: boolean; batter: Record<string, RankingRow[]>; pitcher: Record<string, RankingRow[]>; connected: boolean; errors?: string[]; updatedAt?: string };
type PerformanceResponse = { success: boolean; connected: boolean; batter: any; pitcher: any; emerging: any; errors?: string[] };

function useJson<T>(url: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; fetch(url, { cache: "no-store" }).then(r => r.json()).then(v => alive && setData(v)).catch(() => {}).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [url]);
  return { data, loading };
}

function historyRows(payload: any) {
  const days = payload?.days || {};
  return Object.entries(days).sort(([a],[b]) => String(b).localeCompare(String(a)));
}
function aggregate(payload: any, period: string) {
  const rows = historyRows(payload);
  const now = new Date();
  const cutoff = period === "Today" ? 1 : period === "Yesterday" ? 2 : period === "Week" ? 7 : period === "Month" ? 31 : 9999;
  const selected = rows.filter(([date]) => {
    const diff = Math.floor((+now - +new Date(`${date}T12:00:00`)) / 86400000);
    if (period === "Today") return diff === 0;
    if (period === "Yesterday") return diff === 1;
    return diff >= 0 && diff < cutoff;
  });
  let settled=0, correct=0, pending=0;
  for (const [,day] of selected as any[]) {
    const cats = day?.categories || {};
    for (const cat of Object.values(cats) as any[]) for (const row of (Array.isArray(cat) ? cat : [])) {
      const state = String(row?.status || row?.result || "").toLowerCase();
      const isPending = !state || /pending|open|unsettled/.test(state);
      if (isPending) pending++;
      else { settled++; if (/hit|win|correct|won|true/.test(state) || row?.correct === true || row?.hit === true) correct++; }
    }
  }
  return { settled, correct, pending, hitRate: settled ? (correct/settled*100).toFixed(1) : "0.0" };
}

function RankingCard({ row, pitcher = false }: { row: RankingRow; pitcher?: boolean }) {
  const id = rankingPlayerId(row); const name = rankingName(row);
  const image = String(row.headshot_url || playerHeadshot(id));
  const gi = numberValue(row.gi_score, 1);
  const metric = pitcher ? `${numberValue(row.projection,1)} K` : percentValue(row.hr_probability ?? row.probability);
  const team = String(row.team_abbreviation || row.team_name || "MLB");
  const opp = String(row.opponent_abbreviation || row.opponent_name || "");
  const pitcherName = String(row.opposing_probable_pitcher || row.probable_pitcher || "");
  const confirmed = row.lineup_confirmed !== false;
  return <article className={`legacyRankCard ${pitcher ? "pitcher" : ""}`}>
    <div className="legacyRank">#{Number(row.rank || 0) || "—"}<span>−</span></div>
    <img className="legacyHeadshot" src={image} alt="" />
    <div className="legacyRankCopy">
      <strong>{name}</strong>
      <div className="matchup">{team}{opp ? ` vs. ${opp}` : ""}</div>
      {pitcher ? <div><b>Projection:</b> {metric}</div> : <><div>{pitcherName ? <>vs. <b>{pitcherName}</b></> : null}</div><div><b>HR Probability:</b> {metric}</div></>}
      <p>{String((row as any).summary || (row as any).reason || (row as any).intelligence_summary || "GI score blends current performance, matchup, lineup position and sample reliability.")}</p>
      <span className="confirmed">✓ {confirmed ? "Confirmed lineup" : "Lineup Pending"}{row.batting_order ? ` · #${row.batting_order}` : ""}</span>
    </div>
    <div className="legacyGi"><small>GI SCORE</small><strong>{gi}</strong></div>
    {id ? <Link className="legacyIntel" href={`/mlb/player/${id}`}>ⓘ View Intelligence</Link> : <button className="legacyIntel" disabled>ⓘ View Intelligence</button>}
  </article>;
}

export function MlbDashboard() {
  const schedule = useJson<ScheduleResponse>("/api/mlb/schedule", { success:false, games:[] });
  const rankings = useJson<RankingResponse>("/api/mlb/rankings", { success:false, batter:{}, pitcher:{}, connected:false });
  const performance = useJson<PerformanceResponse>("/api/mlb/performance", { success:false, connected:false, batter:{}, pitcher:{}, emerging:{} });
  const [role,setRole] = useState<"Batter"|"Pitcher">("Batter");
  const [market,setMarket] = useState("home_runs");
  const [period,setPeriod] = useState("Today");
  const [perfRole,setPerfRole] = useState<"Batter"|"Pitcher"|"Emerging Power">("Batter");
  const games = schedule.data.games || [];
  const liveGames = games.filter(g => g.isLive);
  const delayed = games.filter(g => g.isDelayed).length;
  const lineupGames = 0;
  const perfPayload = perfRole === "Pitcher" ? performance.data.pitcher : perfRole === "Emerging Power" ? performance.data.emerging : performance.data.batter;
  const perf = useMemo(() => aggregate(perfPayload, period), [perfPayload, period]);
  const marketList = role === "Batter" ? BATTER_MARKETS : PITCHER_MARKETS;
  const rows = (role === "Batter" ? rankings.data.batter?.[market] : rankings.data.pitcher?.[market]) || [];
  useEffect(() => { if (role === "Batter" && !BATTER_MARKETS.some(x=>x[0]===market)) setMarket("home_runs"); if (role === "Pitcher" && !PITCHER_MARKETS.some(x=>x[0]===market)) setMarket("strikeouts"); }, [role, market]);
  const activeMarket = marketList.find(x => x[0]===market) || marketList[0];

  return <div className="legacyMlb">
    <section className="legacyIntro">
      <details open><summary>ⓘ What do the HR contact signals mean?</summary><div className="legacyExplain"><p><b>🔥 Barrel</b> — a batted ball with a strong combination of exit velocity and launch angle associated with extra-base damage and home-run potential.</p><p><b>💥 Hard Hit</b> — a batted ball hit at <b>95 mph or harder</b> that does not necessarily qualify as a barrel.</p><p><b>mph / Exit Velocity</b> — how fast the ball leaves the bat. Higher is generally stronger contact.</p><p><b>° / Launch Angle</b> — the vertical angle at which the ball leaves the bat.</p><p><b>Important:</b> a barrel or hard hit is a contact-quality signal, <b>not a prediction or guarantee</b> that the player will hit a home run.</p></div></details>
      <details><summary>ⓘ What should I look for in an HR pick?</summary><div className="legacyExplain"><p><b>Start with barrel rate:</b> below 7% is low, 7–9.9% is average, 10–14.9% is strong, and 15%+ is elite HR contact.</p><p><b>Then confirm the full picture:</b> strong xSLG and recent barrels, a vulnerable opposing pitcher, favourable handedness, park/weather edge, and a confirmed top-five lineup position.</p></div></details>
    </section>

    <div className="liveNotice">{liveGames.length ? `${liveGames.length} MLB game${liveGames.length===1?" is":"s are"} currently live.` : delayed ? `${delayed} MLB game${delayed===1?" is":"s are"} delayed. No delayed game is treated as live.` : "No MLB games are currently live."}</div>

    <section className="legacySection"><h2>📊 Prediction Performance</h2><details><summary>ⓘ How performance is measured</summary><div className="legacyExplain"><p>Settled predictions are graded against the recorded MLB result. Pending predictions are excluded from hit rate until they settle.</p></div></details>
      <div className="legacyTabs top">{["Batter","Pitcher","Emerging Power"].map(x=><button key={x} className={perfRole===x?"active":""} onClick={()=>setPerfRole(x as any)}>{x==="Batter"?"🥎 ":x==="Pitcher"?"⚾ ":"🔥 "}{x}</button>)}</div>
      <h3>🌐 Overall MLB {perfRole} Performance</h3>
      <div className="legacyPeriods">{["Today","Yesterday","Week","Month","Season"].map(x=><button key={x} className={period===x?"active":""} onClick={()=>setPeriod(x)}>{x}</button>)}</div>
      <div className="metricRow"><article className="green"><span>Hit Rate</span><strong>{perf.hitRate}%</strong></article><article><span>Correct / Settled</span><strong>{perf.correct} / {perf.settled}</strong></article><article className="gold"><span>Pending</span><strong>{perf.pending}</strong></article></div>
    </section>

    <section className="legacySection rankings"><div className="rankingsHeader"><h2>Player Rankings</h2><p>Market-specific intelligence · live matchup context</p></div>
      {!rankings.loading && !rankings.data.connected ? <div className="dataWarning"><b>Ranking data connection:</b> {rankings.data.errors?.[0] || "Supabase is not available to this Next.js service."}</div> : null}
      <div className="legacyTabs top"><button className={role==="Batter"?"active":""} onClick={()=>setRole("Batter")}>🥎 Batter</button><button className={role==="Pitcher"?"active":""} onClick={()=>setRole("Pitcher")}>⚾ Pitcher</button></div>
      <div className="legacyTabs markets">{marketList.map(([key,icon,label])=><button key={key} className={market===key?"active":""} onClick={()=>setMarket(key)}>{icon} {label}</button>)}</div>
      <div className="marketHeading"><div><span>{activeMarket[1]}</span><div><h2>{activeMarket[2]}{role==="Batter" ? " Rankings" : ""}</h2><p>{role==="Batter" ? "Ranked by GI Score. Probability is one component of the score, alongside performance, matchup, lineup position, ballpark, weather, and sample reliability." : "Ranked by pitcher GI score using workload, season rates, sample reliability, matchup and opponent handedness."}</p></div></div></div>
      <div className="legacyCards">{rows.slice(0,5).map((row,i)=><RankingCard key={`${rankingPlayerId(row)}-${i}`} row={row} pitcher={role==="Pitcher"} />)}{!rankings.loading && rows.length===0 ? <div className="emptyData">No saved {activeMarket[2]} ranking snapshot was returned. The page is connected, but this market needs a completed worker snapshot.</div> : null}</div>
    </section>

    <section className="legacySection"><h2>🔥 HR Intelligence</h2><div className="legacyTabs markets"><button className="active">Live HR</button><button>Yesterday</button><button>Emerging Power</button></div><div className="liveNotice small">{liveGames.length ? `Live game feed connected for ${liveGames.length} game(s).` : "No MLB games are currently live."}</div></section>

    <Link className="gamesEntry" href="/mlb/games"><strong>⚾ TODAY&apos;S MLB GAMES</strong><span>Open today&apos;s slate, lineups &amp; Game Intelligence →</span></Link>
    <section className="legacySection"><h2>Today&apos;s MLB Snapshot</h2><p className="muted">Always confirm starting lineups</p><div className="metricRow snapshot"><article className="green"><span>GAMES</span><strong>{schedule.loading?"…":games.length}</strong><small>Official MLB schedule</small></article><article><span>LINEUPS</span><strong>{lineupGames || "—"}</strong><small>Confirmed in Game Intelligence</small></article><article className="gold"><span>ALERTS</span><strong>{delayed}</strong><small>Delayed / suspended</small></article></div></section>
  </div>;
}
