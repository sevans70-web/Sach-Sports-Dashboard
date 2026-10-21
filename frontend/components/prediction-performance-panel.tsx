"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./prediction-performance.module.css";

export type PerformanceSport =
  | "mlb"
  | "nfl"
  | "cfb"
  | "nba"
  | "wnba"
  | "nhl"
  | "soccer"
  | "cbb";

type Period = "Today" | "Yesterday" | "Week" | "Month" | "Season";

type PerformanceStat = {
  connected: boolean;
  hits: number;
  settled: number;
  pending: number;
  total: number;
  hitRate: number | null;
  pushes?:number;
  research?:{total:number;awaitingResult:number;completed:number;void:number;hits:number;misses:number;pushes:number;hitRate:number|null};
};

type CategoryConfig = {
  key: string;
  label: string;
  icon: string;
  market?: string;
  group?: string;
  available?: boolean;
  note?: string;
  artSrc?: string;
};

const PERIODS: Period[] = ["Today", "Yesterday", "Week", "Month", "Season"];

const ZERO: PerformanceStat = {
  connected: false,
  hits: 0,
  settled: 0,
  pending: 0,
  total: 0,
  hitRate: null,
};

const SPORT_LABEL: Record<PerformanceSport, string> = {
  mlb: "MLB",
  nfl: "NFL",
  cfb: "CFB",
  nba: "NBA",
  wnba: "WNBA",
  nhl: "NHL",
  soccer: "Soccer",
  cbb: "CBB",
};

const CONFIG: Record<PerformanceSport, CategoryConfig[]> = {
  mlb: [
    { key: "batter", label: "Batter", icon: "⚾" },
    { key: "pitcher", label: "Pitcher", icon: "🥎" },
    { key: "emerging", label: "Emerging Power", icon: "🔥" },
  ],
  nfl: [
    { key: "QB", label: "QB", icon: "🏈", group: "QB" },
    { key: "Offense", label: "Offense", icon: "🏃", group: "Offense" },
    { key: "Q1", label: "Q1", icon: "⏱️", group: "Q1" },
  ],
  cfb: [
    { key: "QB", label: "QB", icon: "🏈", group: "QB" },
    { key: "Offense", label: "Offense", icon: "🏃", group: "Offense" },
  ],
  nba: [
    { key: "points", label: "Points", icon: "🏀", market: "points" },
    { key: "rebounds", label: "Rebounds", icon: "💪", market: "rebounds" },
    { key: "assists", label: "Assists", icon: "🎯", market: "assists" },
    { key: "threes_made", label: "3PT", icon: "3️⃣", market: "threes_made" },
    { key: "pts_rebs_asts", label: "PRA", icon: "📊", market: "pts_rebs_asts" },
    { key: "steals", label: "Steals", icon: "🖐️", market: "steals" },
    { key: "blocks", label: "Blocks", icon: "🧱", market: "blocks" },
    {key:"first_basket",label:"First Basket",icon:"1️⃣",market:"first_basket"},
    ...["points","rebounds","assists","threes_made","pts_rebs_asts"].map(key=>({key:"q1_"+key,label:"Q1 "+({points:"Points",rebounds:"REB",assists:"AST",threes_made:"3PT",pts_rebs_asts:"PRA"} as Record<string,string>)[key],icon:"⏱️",market:"q1_"+key})),
  ],
  wnba: [
    { key: "points", label: "Points", icon: "🏀", market: "points" },
    { key: "rebounds", label: "Rebounds", icon: "💪", market: "rebounds" },
    { key: "assists", label: "Assists", icon: "🎯", market: "assists" },
    { key: "threes_made", label: "3PT", icon: "3️⃣", market: "threes_made" },
    { key: "pts_rebs_asts", label: "PRA", icon: "📊", market: "pts_rebs_asts" },
    { key: "steals", label: "Steals", icon: "🖐️", market: "steals" },
    { key: "blocks", label: "Blocks", icon: "🧱", market: "blocks" },
  ],
  nhl: [
    { key: "shots_on_goal", label: "Shots on Goal", icon: "🏒", market: "shots_on_goal" },
    { key: "points", label: "Points", icon: "⭐", market: "points" },
    { key: "goals", label: "Goals", icon: "🥅", market: "goals" },
    { key: "assists", label: "Assists", icon: "🎯", market: "assists" },
    { key: "blocked_shots", label: "Blocked Shots", icon: "🛡️", market: "blocked_shots" },
    { key: "goalie_saves", label: "Goalie Saves", icon: "🧤", market: "goalie_saves" },
  ],
  soccer: [
    {key:"shots_on_target",label:"Shots on Target",icon:"🎯",market:"shots_on_target"},
    {key:"shots",label:"Shots",icon:"👟",market:"shots"},
    {key:"saves",label:"Saves",icon:"🧤",market:"saves"},
    {key:"goals",label:"Goals",icon:"⚽",market:"goals"},
    {key:"assists",label:"Assists",icon:"🅰️",market:"assists"},
  ],
  cbb: [
    { key: "points", label: "Points", icon: "🏀", market: "points" },
    { key: "rebounds", label: "Rebounds", icon: "💪", market: "rebounds" },
    { key: "assists", label: "Assists", icon: "🎯", market: "assists" },
    { key: "threes_made", label: "3PT", icon: "3️⃣", market: "threes_made" },
    { key: "pts_rebs_asts", label: "PRA", icon: "📊", market: "pts_rebs_asts" },
    { key: "steals", label: "Steals", icon: "🖐️", market: "steals" },
    { key: "blocks", label: "Blocks", icon: "🧱", market: "blocks" },
  ],
};

function normalizeStat(payload: any): PerformanceStat {
  if(payload?.sachPickPerformance) payload={...payload,...payload.sachPickPerformance};
  const hits = Number(payload?.hits ?? payload?.correct ?? 0) || 0;
  const settled = Number(payload?.settled ?? 0) || 0;
  const pending = Number(payload?.pending ?? 0) || 0;
  const total = Number(payload?.total ?? settled + pending) || settled + pending;
  const rawRate = payload?.hitRate;
  const hitRate =
    rawRate == null || rawRate === "" || !Number.isFinite(Number(rawRate))
      ? settled
        ? Math.round((hits / settled) * 1000) / 10
        : null
      : Number(rawRate);

  return {
    research:payload?.researchSummary,
    pushes:Number(payload?.pushes||0),
    connected: payload?.connected !== false && payload?.success !== false,
    hits,
    settled,
    pending,
    total,
    hitRate,
  };
}

function combineStats(stats: PerformanceStat[]): PerformanceStat {
  const usable = stats.filter(Boolean);
  if (!usable.length) return ZERO;
  const hits = usable.reduce((sum, s) => sum + s.hits, 0);
  const settled = usable.reduce((sum, s) => sum + s.settled, 0);
  const pending = usable.reduce((sum, s) => sum + s.pending, 0);
  const total = usable.reduce((sum, s) => sum + s.total, 0);

  return {
    research:combineResearch(usable),
    pushes:usable.reduce((n,s)=>n+(s.pushes||0),0),
    connected: usable.some((s) => s.connected),
    hits,
    settled,
    pending,
    total,
    hitRate: settled ? Math.round((hits / settled) * 1000) / 10 : null,
  };
}

function combineResearch(stats:PerformanceStat[]):NonNullable<PerformanceStat["research"]>{
 const sum=(key:"total"|"awaitingResult"|"completed"|"void"|"hits"|"misses"|"pushes")=>stats.reduce((n,s)=>n+(s.research?.[key]||0),0);
 const hits=sum("hits"),misses=sum("misses");
 return {total:sum("total"),awaitingResult:sum("awaitingResult"),completed:sum("completed"),void:sum("void"),hits,misses,pushes:sum("pushes"),hitRate:hits+misses?Math.round(hits/(hits+misses)*1000)/10:null};
}
function researchStat(stat:PerformanceStat):PerformanceStat{
 const r=stat.research;
 return {...stat,hits:r?.hits||0,settled:r?.completed||0,pending:r?.awaitingResult||0,total:r?.total||0,pushes:r?.pushes||0,hitRate:r?.hitRate??null};
}
function torontoDay(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((x) => x.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateInPeriod(date: string, period: Period) {
  const today = torontoDay();
  const yesterday = torontoDay(-1);

  if (period === "Today") return date === today;
  if (period === "Yesterday") return date === yesterday;

  const d = new Date(`${date}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  const diff = Math.round((+t - +d) / 86400000);

  if (period === "Week") return diff >= 0 && diff < 7;
  if (period === "Month") return date.slice(0, 7) === today.slice(0, 7);
  return date.slice(0, 4) === today.slice(0, 4);
}

function aggregateMlbHistory(payload: any, period: Period): PerformanceStat {
  let hits = 0;
  let settled = 0;
  let pending = 0;
  let total = 0;

  for (const [date, day] of Object.entries(payload?.days || {}) as any[]) {
    if (!dateInPeriod(String(date), period)) continue;

    for (const rows of Object.values(day?.categories || {}) as any[]) {
      for (const row of Array.isArray(rows) ? rows : []) {
        total += 1;

        if (typeof row?.correct === "boolean") {
          settled += 1;
          if (row.correct) hits += 1;
          continue;
        }

        if (row?.finalized === true && typeof row?.absolute_error === "number") {
          settled += 1;
          if (Number(row.absolute_error) <= 1) hits += 1;
          continue;
        }

        pending += 1;
      }
    }
  }

  return {
    connected: payload != null,
    hits,
    settled,
    pending,
    total,
    hitRate: settled ? Math.round((hits / settled) * 1000) / 10 : null,
  };
}

async function fetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Performance request failed: ${response.status}`);
  return response.json();
}

function numberOrDash(value: number, connected: boolean) {
  return connected ? String(value) : "—";
}

function rateOrDash(value: number | null, connected: boolean) {
  if (!connected || value == null) return "—";
  return `${Number(value).toFixed(value % 1 ? 1 : 0)}%`;
}

function PerformanceCards({
  stat,
  compact = false,
  research = false,
}: {
  stat: PerformanceStat;
  compact?: boolean;
  research?: boolean;
}) {
  const losses = Math.max(0, stat.settled - stat.hits-(stat.pushes||0));
  const rate = stat.hitRate == null ? 0 : Math.max(0, Math.min(100, stat.hitRate));

  return (
    <div className={compact ? styles.categoryMetrics : styles.summaryMetrics}>
      <article className={`${styles.metricCard} ${styles.hitRateCard}`}>
        <div
          className={styles.rateRing}
          aria-hidden="true"
          style={{ "--rate": `${rate * 3.6}deg` } as React.CSSProperties}
        />
        <div className={styles.metricCopy}>
          <span>{research?"Hit rate":"Hit Rate"}</span>
          <strong>{rateOrDash(stat.hitRate, stat.connected)}</strong>
          <small>
            {stat.connected ? `${stat.hits} / ${stat.settled-(stat.pushes||0)} decisions` : "Data unavailable"}
          </small>
        </div>
      </article>

      <article className={styles.metricCard}>
        <span className={styles.metricIcon} aria-hidden="true">✓</span>
        <div className={styles.metricCopy}>
          <span>{research?"Settled":"Settled"}</span>
          <strong>{numberOrDash(stat.settled, stat.connected)}</strong>
          <small>
            {stat.connected ? (
              <>
                <b className={styles.winText}>{stat.hits} {research ? "Hits" : "Wins"}</b>
                <b className={styles.lossText}>{losses} {research ? "Misses" : "Losses"}</b>
                {stat.pushes?<b>{stat.pushes} Pushes</b>:null}
              </>
            ) : (
              "No graded data"
            )}
          </small>
        </div>
      </article>

      <article className={styles.metricCard}>
        <span className={styles.hourglass} aria-hidden="true">⌛</span>
        <div className={styles.metricCopy}>
          <span>{research?"Pending":"Verified pending"}</span>
          <strong>{numberOrDash(stat.pending, stat.connected)}</strong>
          <small>{!stat.connected?"Data unavailable":stat.pending?"Awaiting game results":research?"No saved forecasts awaiting results":"No validated picks awaiting results"}</small>
        </div>
      </article>
    </div>
  );
}

function categoryResultLabel(_sport: PerformanceSport, category: CategoryConfig) {
  return `${category.label} prediction results`;
}

export function PredictionPerformancePanel({ sport }: { sport: PerformanceSport }) {
  const categories = CONFIG[sport];
  const [period, setPeriod] = useState<Period>("Today");
  const [league,setLeague]=useState("eng.1");
  const [categoryKey, setCategoryKey] = useState(categories[0]?.key || "");
  const [overall, setOverall] = useState<PerformanceStat>(ZERO);
  const [categoryStat, setCategoryStat] = useState<PerformanceStat>(ZERO);
  const [loading, setLoading] = useState(true);
  const [categoryOpen, setCategoryOpen] = useState(true);
  const researchView=!["mlb","soccer","nba"].includes(sport);

  const activeCategory =
    categories.find((category) => category.key === categoryKey) || categories[0];

  useEffect(() => {
    setCategoryKey(categories[0]?.key || "");
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    if(sport!=="soccer")return;
    const select=document.querySelector(".soccerLeagueRow select") as HTMLSelectElement|null;
    if(!select)return;
    const sync=()=>setLeague(select.value||"eng.1");sync();
    select.addEventListener("change",sync);return()=>select.removeEventListener("change",sync);
  },[sport]);

  useEffect(() => {
    if (!activeCategory) return;

    const controller = new AbortController();
    let alive = true;

    let running=false;
    const run = async () => {
      if(running)return;
      running=true;
      setLoading(true);

      try {
        if (sport === "mlb") {
          const payload = await fetchJson("/api/mlb/performance", controller.signal);
          const stats: Record<string, PerformanceStat> = {
            batter: aggregateMlbHistory(payload?.batter, period),
            pitcher: aggregateMlbHistory(payload?.pitcher, period),
            emerging: aggregateMlbHistory(payload?.emerging, period),
          };

          if (!alive) return;
          setOverall(combineStats(Object.values(stats)));
          setCategoryStat(stats[activeCategory.key] || ZERO);
          return;
        }

        if (sport === "nfl" || sport === "cfb") {
          const available = categories.filter((category) => category.available !== false);
          const rows = await Promise.all(
            available.map(async (category) => {
              const group = encodeURIComponent(category.group || category.key);
              const payload = await fetchJson(
                `/api/${sport}/performance?period=${encodeURIComponent(period)}&group=${group}`,
                controller.signal
              );
              return [category.key, normalizeStat(payload)] as const;
            })
          );

          if (!alive) return;
          const lookup = Object.fromEntries(rows) as Record<string, PerformanceStat>;
          setOverall(combineStats(Object.values(lookup)));
          setCategoryStat(
            activeCategory.available === false ? ZERO : lookup[activeCategory.key] || ZERO
          );
          return;
        }

        const scope=sport==="soccer"?`&league=${encodeURIComponent(league)}`:"";
        const overallPayload = await fetchJson(
          `/api/${sport}/performance?period=${encodeURIComponent(period)}${scope}`,
          controller.signal
        );

        let selected = ZERO;
        if (activeCategory.available !== false && activeCategory.market) {
          const marketPayload = await fetchJson(
            `/api/${sport}/performance?period=${encodeURIComponent(period)}&market=${encodeURIComponent(activeCategory.market)}${scope}`,
            controller.signal
          );
          selected = normalizeStat(marketPayload);
        }

        if (!alive) return;
        setOverall(normalizeStat(overallPayload));
        setCategoryStat(selected);
      } catch {
        if (!alive) return;
        setOverall(ZERO);
        setCategoryStat(ZERO);
      } finally {
        running=false;
        if (alive) setLoading(false);
      }
    };

    run();
    const refresh=window.setInterval(run,60_000);
    return () => {
      window.clearInterval(refresh);
      alive = false;
      controller.abort();
    };
  }, [sport, period, categoryKey,league]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryNote = useMemo(() => {
    if (activeCategory?.note && !researchView) return activeCategory.note;
    if (loading) return "Loading prediction history…";
    if(sport==='nba') return categoryStat.total ? '' : 'No pregame Sach picks saved for this period.';
    if(researchView&&categoryStat.connected){const r=categoryStat.research;return r?`${r.total} saved forecasts · ${r.void} void/withdrawn`:"No saved forecasts for this period.";}
    if (!categoryStat.connected || categoryStat.total === 0) {
      return categoryStat.research?.total ? `${categoryStat.research.total} saved research records: ${categoryStat.research.awaitingResult} awaiting result. No validated ${activeCategory?.label||""} picks for this period.` : `No saved validated ${activeCategory?.label || ""} picks for this period yet.`;
    }
    return "";
  }, [activeCategory, categoryStat, loading,researchView,sport]);

  if (!activeCategory) return null;

  return (
    <div className={`ssPredictionPerformanceRoot ${styles.root}`}>
      <section className={styles.performancePanel}>
        <h2 className={styles.title}>
          <span aria-hidden="true">📊</span>
          Prediction Performance
        </h2>

        {researchView ? <p>Older saved forecasts · separate from current Sach picks.</p> : null}
        {sport==='nba' ? <p>Saved pregame Sach picks · model estimates</p> : null}

        <div className={styles.periodTabs} aria-label="Prediction performance period">
          {PERIODS.map((item) => (
            <button
              key={item}
              type="button"
              className={period === item ? styles.activeTab : ""}
              onClick={() => setPeriod(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <PerformanceCards stat={researchView?researchStat(overall):overall} research={researchView} />

      </section>

      <section className={styles.categoryPanel}>
        <button
          type="button"
          className={styles.categoryHeader}
          onClick={() => setCategoryOpen((value) => !value)}
          aria-expanded={categoryOpen}
        >
          <span>
            <b aria-hidden="true">▥</b>
            Category Performance
          </span>
          <i aria-hidden="true">{categoryOpen ? "⌄" : "›"}</i>
        </button>

        {categoryOpen ? (
          <>
            <div className={styles.categoryTabs} aria-label={`${SPORT_LABEL[sport]} categories`}>
              {categories.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  className={category.key === activeCategory.key ? styles.activeCategory : ""}
                  onClick={() => setCategoryKey(category.key)}
                >
                  <span aria-hidden="true">{category.icon}</span>
                  {category.label}
                </button>
              ))}
            </div>

            <div className={styles.categoryBody}>
              <div className={styles.categoryIdentity}>
                {activeCategory.artSrc ? (
                  <img src={activeCategory.artSrc} alt="" className={styles.categoryArt} />
                ) : (
                  <span className={styles.categoryFallback} aria-hidden="true">
                    {activeCategory.icon}
                  </span>
                )}
                <div>
                  <strong>{categoryResultLabel(sport, activeCategory)}</strong>
                </div>
              </div>

              <PerformanceCards stat={researchView?researchStat(categoryStat):categoryStat} research={researchView} compact />

              {categoryNote ? <p className={styles.categoryNote}>{categoryNote}</p> : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
