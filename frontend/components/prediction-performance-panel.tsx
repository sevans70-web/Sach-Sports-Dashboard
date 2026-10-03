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
    { key: "Q1", label: "Q1", icon: "1Q", group: "Q1" },
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
    {
      key: "q1",
      label: "Q1",
      icon: "1Q",
      available: false,
      note: "Q1 is built into the NBA performance design. Results will populate when the NBA Q1 market feed is connected.",
    },
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
    {
      key: "shots_on_target",
      label: "Shots on Target",
      icon: "🎯",
      available: false,
      note: "Soccer category performance is ready visually. Results will populate when soccer prediction-history grading is connected.",
    },
    { key: "shots", label: "Shots", icon: "👟", available: false },
    { key: "saves", label: "Saves", icon: "🧤", available: false },
    { key: "goals", label: "Goals", icon: "⚽", available: false },
    { key: "assists", label: "Assists", icon: "🅰️", available: false },
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
    connected: usable.some((s) => s.connected),
    hits,
    settled,
    pending,
    total,
    hitRate: settled ? Math.round((hits / settled) * 1000) / 10 : null,
  };
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
}: {
  stat: PerformanceStat;
  compact?: boolean;
}) {
  const losses = Math.max(0, stat.settled - stat.hits);
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
          <span>Hit Rate</span>
          <strong>{rateOrDash(stat.hitRate, stat.connected)}</strong>
          <small>
            {stat.connected ? `${stat.hits} / ${stat.settled}` : "No graded data"}
          </small>
        </div>
      </article>

      <article className={styles.metricCard}>
        <span className={styles.metricIcon} aria-hidden="true">✓</span>
        <div className={styles.metricCopy}>
          <span>Settled</span>
          <strong>{numberOrDash(stat.settled, stat.connected)}</strong>
          <small>
            {stat.connected ? (
              <>
                <b className={styles.winText}>{stat.hits} Wins</b>
                <b className={styles.lossText}>{losses} Losses</b>
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
          <span>Pending</span>
          <strong>{numberOrDash(stat.pending, stat.connected)}</strong>
          <small>In Progress</small>
        </div>
      </article>
    </div>
  );
}

function categorySubtitle(sport: PerformanceSport, category: CategoryConfig) {
  if (sport === "nfl" || sport === "cfb") {
    return `All ${category.label} prop predictions`;
  }
  if (sport === "mlb") {
    if (category.key === "emerging") return "Emerging-power prediction results";
    return `All ${category.label.toLowerCase()} prediction results`;
  }
  return `${category.label} prediction results`;
}

export function PredictionPerformancePanel({ sport }: { sport: PerformanceSport }) {
  const categories = CONFIG[sport];
  const [period, setPeriod] = useState<Period>("Today");
  const [categoryKey, setCategoryKey] = useState(categories[0]?.key || "");
  const [overall, setOverall] = useState<PerformanceStat>(ZERO);
  const [categoryStat, setCategoryStat] = useState<PerformanceStat>(ZERO);
  const [loading, setLoading] = useState(true);
  const [categoryOpen, setCategoryOpen] = useState(true);

  const activeCategory =
    categories.find((category) => category.key === categoryKey) || categories[0];

  useEffect(() => {
    setCategoryKey(categories[0]?.key || "");
  }, [sport]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeCategory) return;

    const controller = new AbortController();
    let alive = true;

    const run = async () => {
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

        if (sport === "soccer") {
          if (!alive) return;
          setOverall(ZERO);
          setCategoryStat(ZERO);
          return;
        }

        const overallPayload = await fetchJson(
          `/api/${sport}/performance?period=${encodeURIComponent(period)}`,
          controller.signal
        );

        let selected = ZERO;
        if (activeCategory.available !== false && activeCategory.market) {
          const marketPayload = await fetchJson(
            `/api/${sport}/performance?period=${encodeURIComponent(period)}&market=${encodeURIComponent(activeCategory.market)}`,
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
        if (alive) setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [sport, period, categoryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryNote = useMemo(() => {
    if (activeCategory?.note) return activeCategory.note;
    if (loading) return "Loading prediction history…";
    if (!categoryStat.connected || categoryStat.total === 0) {
      return `No saved ${activeCategory?.label || ""} predictions for this period yet.`;
    }
    return "";
  }, [activeCategory, categoryStat, loading]);

  if (!activeCategory) return null;

  return (
    <div className={`ssPredictionPerformanceRoot ${styles.root}`}>
      <section className={styles.performancePanel}>
        <h2 className={styles.title}>
          <span aria-hidden="true">📊</span>
          Prediction Performance
        </h2>

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

        <PerformanceCards stat={overall} />
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
                  <strong>{activeCategory.label} Performance</strong>
                  <small>{categorySubtitle(sport, activeCategory)}</small>
                </div>
              </div>

              <PerformanceCards stat={categoryStat} compact />

              {categoryNote ? <p className={styles.categoryNote}>{categoryNote}</p> : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
