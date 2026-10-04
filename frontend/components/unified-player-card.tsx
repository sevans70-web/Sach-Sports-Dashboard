"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SportsNav } from "@/components/dashboard-chrome";
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
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function finite(value: QueryValue) {
  const raw = first(value);
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function fmt(value: number | null, digits = 1) {
  if (value == null) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits).replace(/\.0$/, "");
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "SS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)?.[0] || ""}`.toUpperCase();
}

function historyUrl(
  sport: SportKey,
  playerId: string,
  playerName: string,
  team: string,
  market: string
) {
  if (["nfl", "cfb", "nba", "wnba", "cbb"].includes(sport)) {
    return `/api/${sport}/player/${encodeURIComponent(playerId)}/history?market=${encodeURIComponent(
      market
    )}`;
  }

  const params = new URLSearchParams({
    sport,
    playerId,
    playerName,
    team,
    market,
  });

  return `/api/player-history?${params.toString()}`;
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
  const [span, setSpan] = useState<5 | 10 | 20>(10);
  const [history, setHistory] = useState<number[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const name = first(query.name) || "Player";
  const team = first(query.team) || LABELS[sport];
  const matchup = first(query.matchup);
  const market = first(query.market);
  const line = finite(query.line);
  const projection = finite(query.projection);
  const gi = finite(query.gi);
  const probability = finite(query.prob);
  const actual = finite(query.actual);
  const pick = first(query.pick).toUpperCase();
  const position = first(query.position);
  const gameState = first(query.state).toLowerCase();
  const gameStatus = first(query.status);
  const image = first(query.img);
  const requestedMode = first(query.mode);

  const hasPrediction = Boolean(
    market &&
      line != null &&
      (projection != null || probability != null || pick)
  );

  const mode =
    requestedMode === "profile" || !hasPrediction
      ? "profile"
      : "prediction";

  const effectivePick =
    pick ||
    (
      line != null && projection != null
        ? projection >= line
          ? "OVER"
          : "UNDER"
        : line != null && probability != null
          ? probability >= 50
            ? "OVER"
            : "UNDER"
          : ""
    );

  const edge =
    line != null && projection != null
      ? projection - line
      : null;

  useEffect(() => {
    if (!playerId) return;

    const controller = new AbortController();
    setHistoryLoading(true);

    fetch(
      historyUrl(
        sport,
        playerId,
        name,
        team,
        market
      ),
      {
        cache: "no-store",
        signal: controller.signal,
      }
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload || controller.signal.aborted) return;

        const values = Array.isArray(payload?.points)
          ? payload.points
              .map((point: any) => Number(point?.value))
              .filter((value: number) => Number.isFinite(value))
          : Array.isArray(payload?.values)
            ? payload.values
                .map((value: any) => Number(value))
                .filter((value: number) => Number.isFinite(value))
            : Array.isArray(payload?.games)
              ? payload.games
                  .map((game: any) =>
                    Number(
                      game?.value ??
                      game?.actual ??
                      game?.stat
                    )
                  )
                  .filter((value: number) => Number.isFinite(value))
              : [];

        setHistory(values.slice(-20));
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
        }
      });

    return () => controller.abort();
  }, [sport, playerId, name, team, market]);

  const visibleHistory = useMemo(
    () => history.slice(-span),
    [history, span]
  );

  const chartMax = Math.max(
    1,
    ...visibleHistory,
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

  return (
    <main className={styles.shell}>
      <div className={styles.brand}>
        <img src="/brand/sach-sports-crown-logo.png" alt="" />
        <strong>
          <span>SACH</span> SPORTS
        </strong>
      </div>

      <SportsNav active={sport} />

      <button
        type="button"
        className={styles.back}
        onClick={() => router.back()}
      >
        ← Back to {LABELS[sport]}
      </button>

      <section className={styles.identityCard}>
        <div className={styles.photo}>
          {image ? (
            <img src={image} alt="" />
          ) : (
            <span>{initials(name)}</span>
          )}
        </div>

        <div className={styles.identity}>
          <small>{LABELS[sport]}</small>
          <h1>{name}</h1>
          <p>
            {position ? `${position} · ` : ""}
            {team}
          </p>
          {matchup ? <strong>{matchup}</strong> : null}
        </div>
      </section>

      {(live || final || gameStatus) ? (
        <section className={`${styles.statusCard} ${live ? styles.live : ""}`}>
          <span>GAME STATUS</span>
          <strong>
            {live ? "LIVE" : final ? "FINAL" : "STATUS"}
          </strong>
          <p>{gameStatus || (live ? "In Progress" : final ? "Final" : "Scheduled")}</p>
        </section>
      ) : null}

      {mode === "prediction" ? (
        <>
          <section className={styles.marketBar}>
            <strong>{market.replaceAll("_", " ")}</strong>
            <span>
              GI {fmt(gi)}
              {probability != null ? ` · ${fmt(probability, 0)}%` : ""}
            </span>
          </section>

          <section className={styles.metrics}>
            <article>
              <span>Sportsbook Line</span>
              <strong>{fmt(line)}</strong>
            </article>
            <article>
              <span>Model Projection</span>
              <strong>{fmt(projection)}</strong>
            </article>
            <article>
              <span>Sach Prediction</span>
              <strong className={styles.pick}>{effectivePick || "—"}</strong>
            </article>
            <article>
              <span>Model Edge</span>
              <strong>
                {edge == null
                  ? "—"
                  : `${edge >= 0 ? "+" : ""}${fmt(edge)}`}
              </strong>
            </article>
          </section>

          {final ? (
            <section className={styles.resultCard}>
              <span>RESULT</span>
              <strong>
                {actual == null
                  ? "Actual stat not attached yet"
                  : `Actual ${fmt(actual)}`}
              </strong>
            </section>
          ) : null}

          <section className={styles.why}>
            <h2>Why This Player Ranks Here</h2>
            <p>
              This card shows a sportsbook-backed prediction. The line,
              projection and Sach pick are kept together so the same pregame
              prediction can be reviewed during the game and graded after final.
            </p>
          </section>
        </>
      ) : (
        <section className={styles.profileCard}>
          <h2>Player Profile</h2>
          <p>
            No active sportsbook-backed prediction is attached to this player
            from the screen you opened. This view is for player research only,
            so it does not invent a line, pick or betting result.
          </p>

          <div className={styles.profileMetrics}>
            <div>
              <span>Position</span>
              <strong>{position || "—"}</strong>
            </div>
            <div>
              <span>Team</span>
              <strong>{team || "—"}</strong>
            </div>
          </div>
        </section>
      )}

      <section className={styles.historySection}>
        <div className={styles.historyTabs}>
          {([5, 10, 20] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={span === value ? styles.activeHistory : ""}
              onClick={() => setSpan(value)}
            >
              Last {value}
            </button>
          ))}
        </div>

        <h2>
          Last {span} Games
          {market ? ` · ${market.replaceAll("_", " ")}` : ""}
        </h2>

        {historyLoading && !visibleHistory.length ? (
          <div className={styles.historyEmpty}>
            Loading recent player history…
          </div>
        ) : visibleHistory.length ? (
          <div className={styles.chart}>
            {visibleHistory.map((value, index) => (
              <div className={styles.barSlot} key={`${value}-${index}`}>
                <b>{fmt(value)}</b>
                <i
                  style={{
                    height: `${Math.max(
                      8,
                      (value / chartMax) * 100
                    )}%`,
                  }}
                />
                <span>G{index + 1}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.historyEmpty}>
            Recent game-by-game history is not available from this feed yet.
          </div>
        )}
      </section>
    </main>
  );
}
