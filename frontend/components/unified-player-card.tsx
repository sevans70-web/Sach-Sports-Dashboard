"use client";
import {propLineText} from '@/lib/prop-line-format';
import {SavedEstimatedEv,useSavedSelection} from '@/components/saved-estimated-ev';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./unified-player-card.module.css";

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
    ["nfl", "cfb", "nba", "wnba", "cbb"].includes(
      sport
    )
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

function shortDate(value: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
    }
  ).format(date);
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
    useState<5 | 10 | 20>(10);
  const [history, setHistory] =
    useState<HistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] =
    useState(false);
  const [historyLabel, setHistoryLabel] =
    useState("");

  const name =
    first(query.name) || "Player";

  const team =
    first(query.team) || LABELS[sport];

  const matchup = first(query.matchup);

  const requestedMarket =
    first(query.market);

  const position =
    first(query.position);

  const researchMarket =
    (requestedMarket && requestedMarket !== "watch" ? requestedMarket : "") ||
    defaultResearchMarket(
      sport,
      position
    );

  const savedEvidence=useSavedSelection(sport,playerId,researchMarket,first(query.gameId)||undefined,first(query.quoteId)||undefined,first(query.forecastAt)||undefined);
  const savedSelection=savedEvidence.selection;
  const line = savedSelection?.line ?? savedEvidence.forecast?.line ?? finite(query.line);
  const projection = savedEvidence.forecast?.projection ?? null;
  const probability = null;
  const actual =
    finite(query.actual);

  const gameState =
    first(query.state).toLowerCase();

  const gameStatus =
    first(query.status);

  const image =
    first(query.img);

  const hasPrediction = Boolean(
    requestedMarket &&
      line != null &&
      (
        projection != null ||
        probability != null ||
        savedSelection || savedEvidence.forecast || first(query.mode)==='prediction'
      )
  );

  const effectivePick = savedSelection?.side || '';
  // Direction from a model estimate is not a verified betting selection.
  const forecastDirection = !effectivePick && projection != null && line != null
    ? projection > line ? 'OVER' : projection < line ? 'UNDER' : 'AT LINE'
    : '';
  const displayedPick = effectivePick || (forecastDirection ? `Forecast ${forecastDirection}` : 'Not established');

  const edge =
    line != null &&
    projection != null
      ? projection - line
      : null;

  const edgePct =
    line != null &&
    line !== 0 &&
    projection != null
      ? ((projection - line) / Math.abs(line)) * 100
      : null;

  useEffect(() => {
    if (
      !playerId ||
      !researchMarket
    ) {
      setHistory([]);
      setHistoryLabel("");
      return;
    }

    const controller =
      new AbortController();

    setHistoryLoading(true);

    fetch(
      historyUrl(
        sport,
        playerId,
        name,
        team,
        researchMarket,
        first(query.league)||'eng.1',
        first(query.source)
      ),
      {
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

        const points: HistoryPoint[] =
          Array.isArray(payload?.points)
            ? payload.points
                .map((point: any) => ({
                  value: Number(
                    point?.value
                  ),
                  date: String(
                    point?.date || ""
                  ),
                  opponent: String(
                    point?.opponent || ""
                  ),
                }))
                .filter((point: HistoryPoint) =>
                  Number.isFinite(
                    point.value
                  )
                )
            : Array.isArray(
                payload?.values
              )
              ? payload.values
                  .map(
                    (
                      value: any
                    ): HistoryPoint => ({
                      value:
                        Number(value),
                    })
                  )
                  .filter((point: HistoryPoint) =>
                    Number.isFinite(
                      point.value
                    )
                  )
              : Array.isArray(
                  payload?.games
                )
                ? payload.games
                    .map(
                      (
                        game: any
                      ): HistoryPoint => ({
                        value: Number(
                          game?.value ??
                          game?.actual ??
                          game?.stat
                        ),
                        date: String(
                          game?.date || ""
                        ),
                        opponent:
                          String(
                            game?.opponent ||
                            ""
                          ),
                      })
                    )
                    .filter(
                      (point: HistoryPoint) =>
                        Number.isFinite(
                          point.value
                        )
                    )
                : [];

        setHistory(
          points.slice(-20)
        );
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
  ]);

  const visibleHistory =
    useMemo(
      () =>
        history.slice(-span),
      [history, span]
    );

  const replay = useMemo(() => {
    if (!visibleHistory.length || line == null || !effectivePick) {
      return null;
    }

    const under = effectivePick === "UNDER";
    const hits = visibleHistory.filter((point) =>
      under ? point.value < line : point.value > line
    ).length;

    return {
      hits,
      total: visibleHistory.length,
      pct: Math.round((hits / visibleHistory.length) * 100),
    };
  }, [visibleHistory, line, effectivePick]);

  const chartMax = Math.max(
    1,
    ...visibleHistory.map(
      (point) => point.value
    ),
    line || 0,
    projection || 0,
    actual || 0
  );

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

  const scheduled =
    !live && !final;

  const statusLabel =
    live
      ? "LIVE"
      : final
        ? "FINAL"
        : "SCHEDULED";

  return (
    <main className={styles.shell}>
      <div
        className={styles.goldWash}
        aria-hidden="true"
      />

      <div className={styles.utilityRow}>
        <button
          type="button"
          className={styles.back}
          onClick={() =>
            router.back()
          }
        >
          ← Back to {LABELS[sport]}
        </button>

        <span
          className={
            hasPrediction
              ? styles.modePrediction
              : styles.modeResearch
          }
        >
          {hasPrediction
            ? "Prediction Intelligence"
            : "Player Intelligence"}
        </span>
      </div>

      <section className={styles.identityCard}>
        <div className={styles.photo}>
          {image ? (
            <img src={image} alt="" />
          ) : (
            <span>
              {initials(name)}
            </span>
          )}
        </div>

        <div className={styles.identity}>
          <small>
            {LABELS[sport]}
          </small>

          <h1>{name}</h1>

          <p>
            {position
              ? `${position} · `
              : ""}
            {team}
          </p>

          {matchup ? (
            <strong>
              {matchup}
            </strong>
          ) : null}
        </div>
      </section>

      {(live ||
        final ||
        gameStatus) ? (
        <section
          className={`${styles.statusCard} ${
            live
              ? styles.live
              : ""
          }`}
        >
          <span>GAME STATUS</span>

          <strong>
            {statusLabel}
          </strong>

          <p>
            {gameStatus ||
              (live
                ? "In Progress"
                : final
                  ? "Final"
                  : "Scheduled")}
          </p>
        </section>
      ) : null}

      <section
        className={`${styles.marketBar} ${
          live
            ? styles.liveMarket
            : ""
        }`}
      >
        <div>
          <span>
            {hasPrediction
              ? "ACTIVE MARKET"
              : "RESEARCH STAT"}
          </span>

          <strong>
            {marketLabel(
              researchMarket
            )}
          </strong>
        </div>

        <b>
          EV {savedSelection?<SavedEstimatedEv sport={sport} playerId={playerId} market={researchMarket} gameId={first(query.gameId)||undefined} quoteId={first(query.quoteId)||undefined} forecastAt={first(query.forecastAt)||undefined}/>:"—"}

        </b>
      </section>

      <details style={{margin:"12px 0",padding:"12px 16px",border:"1px solid #454036",borderRadius:12}}>
        <summary>Probability details</summary>
        <p>Model probability {savedSelection?<SavedEstimatedEv metric="probability" sport={sport} playerId={playerId} market={researchMarket} gameId={first(query.gameId)||undefined} quoteId={first(query.quoteId)||undefined} forecastAt={first(query.forecastAt)||undefined}/>:"—"}</p>
      </details>

      {hasPrediction ? (
        <>
          <section
            className={styles.metrics}
          >
            <article>
              <span>
                {savedSelection||savedEvidence.forecast?"Sportsbook Line":"Reference Line"}
              </span>
              <strong>
                {propLineText(line)}
              </strong>
            </article>

            <article>
              <span>
                Sach projection
              </span>
              <strong>
                {projection==null?'Unavailable':fmt(projection)}
              </strong>
            </article>

            <article>
              <span>
                {effectivePick ? "Saved selection" : "Forecast Direction"}
              </span>
              <strong
                className={
                  styles.pick
                }
              >
                {displayedPick}
              </strong>
            </article>

            <article>
              <span>Model Edge</span>
              <strong>
                {edge == null
                  ? "—"
                  : `${edge >= 0 ? "+" : ""}${fmt(edge)}`}
              </strong>
              {edgePct != null ? (
                <small className={styles.metricNote}>
                  {Math.abs(edgePct).toFixed(0)}% {edgePct >= 0 ? "above" : "below"} line
                </small>
              ) : null}
            </article>
          </section>

          <section className={styles.playCard}>
            <div className={styles.playHead}>
              <div>
                <small>SACH PLAY</small>
                <h2>{marketLabel(researchMarket)}</h2>
              </div>
              <strong>{effectivePick?`${effectivePick} ${propLineText(line)}`:forecastDirection?`Forecast ${forecastDirection} ${propLineText(line)}`:'Not established'}</strong>
            </div>

            <div className={styles.playRows}>
              <div>
                <span>
                  <b>Main Play</b>
                  <small>{effectivePick ? `${savedSelection?.sportsbook} · ${savedSelection?.odds>0?'+':''}${savedSelection?.odds} · saved pregame` : "Forecast only — no verified selection"}</small>
                </span>
                <strong>{effectivePick?`${effectivePick} ${propLineText(line)}`:forecastDirection?`Forecast ${forecastDirection} ${propLineText(line)}`:'Not established'}</strong>
              </div>
              <div>
                <span>
                  <b>Sach projection</b>
                  <small>Model estimate</small>
                </span>
                <strong>{projection==null?'Unavailable':fmt(projection)}</strong>
              </div>
              <div>
                <span>
                  <b>Recent Replay</b>
                  <small>Last {span} at this line</small>
                </span>
                <strong>
                  {replay
                    ? `${replay.hits}/${replay.total} · ${replay.pct}%`
                    : "Waiting for verified history"}
                </strong>
              </div>
            </div>
          </section>

          {final ? (
            <section
              className={`${styles.resultCard} ${result === "MISS" ? styles.resultMiss : ""}`}
            >
              <span>RESULT</span>

              <strong>
                {actual == null
                  ? "Actual stat not attached yet"
                  : `${result === "HIT" ? "✅ HIT" : result === "MISS" ? "❌ MISS" : result === "PUSH" ? "➖ PUSH" : "FINAL"} · Actual ${fmt(actual)}`}
              </strong>
            </section>
          ) : null}


        </>
      ) : (
        <>
          <section
            className={
              styles.researchMetrics
            }
          >
            <article>
              <span>Position</span>
              <strong>
                {position || "—"}
              </strong>
            </article>

            <article>
              <span>Team</span>
              <strong>
                {team || "—"}
              </strong>
            </article>

            <article>
              <span>
                Stat
              </span>
              <strong>
                {marketLabel(
                  researchMarket
                )}
              </strong>
            </article>

            <article>
              <span>Status</span>
              <strong>
                {scheduled
                  ? "Scheduled"
                  : statusLabel}
              </strong>
            </article>
          </section>


        </>
      )}

      <section
        className={styles.historySection}
      >
        <div
          className={styles.historyTabs}
        >
          {(
            [5, 10, 20] as const
          ).map((value) => (
            <button
              type="button"
              key={value}
              className={
                span === value
                  ? styles.activeHistory
                  : ""
              }
              onClick={() =>
                setSpan(value)
              }
            >
              Last {value}
            </button>
          ))}
        </div>

        <div
          className={
            styles.historyHeading
          }
        >
          <div>
            <small>
              RECENT FORM
            </small>

            <h2>
              Last {span} Games
            </h2>
          </div>

          <strong>
            {historyLabel ||
              marketLabel(
                researchMarket
              )}
          </strong>
        </div>

        {historyLoading &&
        !visibleHistory.length ? (
          <div
            className={
              styles.historyEmpty
            }
          >
            Loading verified recent
            history…
          </div>
        ) : visibleHistory.length ? (
          <div className={styles.chart}>
            {visibleHistory.map(
              (point, index) => (
                <div
                  className={
                    styles.barSlot
                  }
                  key={`${point.value}-${point.date}-${index}`}
                >
                  <b>
                    {fmt(
                      point.value
                    )}
                  </b>

                  <i
                    style={{
                      height: `${Math.max(
                        8,
                        (
                          point.value /
                          chartMax
                        ) * 100
                      )}%`,
                    }}
                  />

                  <span>
                    {shortDate(
                      point.date || ""
                    ) ||
                      `G${index + 1}`}
                  </span>

                  {point.opponent ? (
                    <em>
                      {point.opponent}
                    </em>
                  ) : null}
                </div>
              )
            )}
          </div>
        ) : (
          <div
            className={
              styles.historyEmpty
            }
          >
            Verified game-by-game
            {researchMarket
              ? ` ${marketLabel(
                  researchMarket
                )}`
              : ""}{" "}
            history is not available from
            this feed yet.
          </div>
        )}
      </section>
    </main>
  );
}
