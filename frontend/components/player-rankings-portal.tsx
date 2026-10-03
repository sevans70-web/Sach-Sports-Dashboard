"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  PlayerRankingsPanel,
  type RankingsSport,
} from "./player-rankings-panel";

const SPORTS = new Set<RankingsSport>([
  "mlb",
  "nfl",
  "cfb",
  "nba",
  "wnba",
  "nhl",
  "soccer",
  "cbb",
]);

const BUILT_IN_HISTORY = new Set<RankingsSport>([
  "nfl",
  "cfb",
  "nba",
  "wnba",
  "cbb",
]);

const DEFAULT_MARKET: Record<RankingsSport, string> = {
  mlb: "home_runs",
  nfl: "passing_yards",
  cfb: "passing_yards",
  nba: "points",
  wnba: "points",
  nhl: "shots_on_goal",
  soccer: "shots_on_target",
  cbb: "points",
};

const MLB_PITCHER_MARKETS = new Set([
  "strikeouts",
  "outs_recorded",
  "hits_allowed",
  "walks_allowed",
  "earned_runs",
]);

const MARKET_LABELS: Record<string, string> = {
  "home runs": "home_runs",
  "hits": "hits",
  "total bases": "total_bases",
  "runs": "runs",
  "rbis": "rbis",
  "hits + runs + rbis": "hits_runs_rbis",
  "walks": "walks",
  "stolen bases": "stolen_bases",
  "batter strikeouts": "batter_strikeouts",
  "strikeouts": "strikeouts",
  "outs recorded": "outs_recorded",
  "hits allowed": "hits_allowed",
  "walks allowed": "walks_allowed",
  "earned runs": "earned_runs",
  "shots on target": "shots_on_target",
  "shots": "shots",
  "goalkeeper saves": "saves",
  "saves": "saves",
  "goals": "goals",
  "assists": "assists",
};

const recentHistoryCache = new Map<string, number[]>();
const recentHistoryInflight = new Map<string, Promise<number[]>>();

function sportFromPath(pathname: string): RankingsSport | null {
  const first = pathname.split("/").filter(Boolean)[0] as RankingsSport | undefined;
  return first && SPORTS.has(first) ? first : null;
}

function normalizeLabel(value: string) {
  return value
    .replace(/[^\p{L}\p{N}+ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function marketFromButton(button: HTMLButtonElement) {
  const label = normalizeLabel(button.textContent || "");
  return MARKET_LABELS[label] || "";
}

function historyKey(
  sport: RankingsSport,
  playerId: string,
  market: string,
  league: string
) {
  return `${sport}|${league}|${playerId}|${market}`;
}

function playerIdFor(row: any) {
  return String(
    row?.playerId ??
      row?.player_id ??
      row?.batter_id ??
      row?.pitcher_id ??
      ""
  );
}

function playerNameFor(row: any) {
  return String(
    row?.playerName ??
      row?.player_name ??
      row?.batter_name ??
      row?.pitcher_name ??
      ""
  );
}

function teamFor(row: any) {
  return String(
    row?.teamName ??
      row?.team_name ??
      row?.team ??
      row?.team_abbreviation ??
      ""
  );
}

async function loadRecentHistory(
  nativeFetch: typeof window.fetch,
  sport: RankingsSport,
  row: any,
  market: string,
  league = ""
) {
  const playerId = playerIdFor(row);
  if (!playerId || !market) return [];

  const key = historyKey(sport, playerId, market, league);
  const cached = recentHistoryCache.get(key);
  if (cached) return cached;

  const running = recentHistoryInflight.get(key);
  if (running) return running;

  const promise = (async () => {
    try {
      let url = "";

      if (BUILT_IN_HISTORY.has(sport)) {
        url =
          `/api/${sport}/player/${encodeURIComponent(playerId)}/history` +
          `?market=${encodeURIComponent(market)}`;
      } else {
        const params = new URLSearchParams({
          sport,
          playerId,
          playerName: playerNameFor(row),
          team: teamFor(row),
          market,
        });

        if (league) params.set("league", league);
        url = `/api/player-history?${params.toString()}`;
      }

      const response = await nativeFetch(url, { cache: "no-store" });
      if (!response.ok) return [];

      const payload = await response.json();

      const values = BUILT_IN_HISTORY.has(sport)
        ? (Array.isArray(payload?.points) ? payload.points : [])
            .map((point: any) => Number(point?.value))
            .filter((value: number) => Number.isFinite(value))
        : (Array.isArray(payload?.values) ? payload.values : [])
            .map((value: any) => Number(value))
            .filter((value: number) => Number.isFinite(value));

      const recent = values.slice(-20);
      if (recent.length) recentHistoryCache.set(key, recent);
      return recent;
    } catch {
      return [];
    } finally {
      recentHistoryInflight.delete(key);
    }
  })();

  recentHistoryInflight.set(key, promise);
  return promise;
}

async function enrichRankingRows(
  nativeFetch: typeof window.fetch,
  sport: RankingsSport,
  market: string,
  rows: any[],
  league = "",
  awaitedCount = 5
) {
  const copy = rows.map((row) => ({ ...row }));
  const first = copy.slice(0, awaitedCount);

  await Promise.all(
    first.map(async (row) => {
      const existing = [
        row?.recentValues,
        row?.recent_values,
        row?.last10,
        row?.last_10,
        row?.recentGames,
        row?.recent_games,
        row?.gameLog,
      ].find((value) => Array.isArray(value) && value.length);

      if (existing) return;

      const values = await loadRecentHistory(
        nativeFetch,
        sport,
        row,
        market,
        league
      );

      if (values.length) row.recentValues = values;
    })
  );

  // Warm the remaining Top 25 without delaying the visible first five.
  void Promise.all(
    copy.slice(awaitedCount).map((row) =>
      loadRecentHistory(nativeFetch, sport, row, market, league)
    )
  );

  return copy;
}

function jsonResponse(source: Response, payload: any) {
  const headers = new Headers(source.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(payload), {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
}

function cfbLegacyRankingHost() {
  const sections = Array.from(
    document.querySelectorAll("section")
  ) as HTMLElement[];

  return (
    sections.find((section) => section.querySelector(".rankHeader")) ||
    sections.find((section) =>
      /player rankings/i.test(
        section.querySelector("h2")?.textContent || ""
      )
    ) ||
    null
  );
}

export function PlayerRankingsPortal() {
  const pathname = usePathname();
  const sport = sportFromPath(pathname);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!sport) return;

    const nativeFetch = window.fetch.bind(window);
    let activeMarket = DEFAULT_MARKET[sport];

    const trackMarketClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest(
        ".ssPlayerRankingsRoot button"
      ) as HTMLButtonElement | null;

      if (!button) return;

      const next = marketFromButton(button);
      if (next) activeMarket = next;
    };

    document.addEventListener("click", trackMarketClick, true);

    window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const response = await nativeFetch(input, init);

      try {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;

        const parsed = new URL(rawUrl, window.location.origin);
        if (!response.ok) return response;

        // NFL, CFB, NBA, WNBA, NHL and CBB use /rankings?market=...
        const standard = parsed.pathname.match(
          /^\/api\/(nfl|cfb|nba|wnba|nhl|cbb)\/rankings$/
        );

        if (standard) {
          const responseSport = standard[1] as RankingsSport;
          const market = parsed.searchParams.get("market") || activeMarket;
          const payload = await response.clone().json();

          if (!Array.isArray(payload?.rows) || !payload.rows.length) {
            return response;
          }

          const rows = await enrichRankingRows(
            nativeFetch,
            responseSport,
            market,
            payload.rows,
            "",
            5
          );

          return jsonResponse(response, { ...payload, rows });
        }

        // MLB returns all batter/pitcher markets in one rankings payload.
        if (parsed.pathname === "/api/mlb/rankings") {
          const payload = await response.clone().json();
          const pitcher = MLB_PITCHER_MARKETS.has(activeMarket);
          const branch = pitcher ? payload?.pitcher : payload?.batter;
          const rows = branch?.[activeMarket];

          if (!Array.isArray(rows) || !rows.length) return response;

          const enriched = await enrichRankingRows(
            nativeFetch,
            "mlb",
            activeMarket,
            rows,
            "",
            5
          );

          const nextBranch = { ...(branch || {}), [activeMarket]: enriched };
          return jsonResponse(response, {
            ...payload,
            [pitcher ? "pitcher" : "batter"]: nextBranch,
          });
        }

        // Soccer returns all markets inside /dashboard?league=...
        if (parsed.pathname === "/api/soccer/dashboard") {
          const payload = await response.clone().json();
          const league = parsed.searchParams.get("league") || "eng.1";
          const rows = payload?.rankings?.[activeMarket];

          if (!Array.isArray(rows) || !rows.length) return response;

          const enriched = await enrichRankingRows(
            nativeFetch,
            "soccer",
            activeMarket,
            rows,
            league,
            5
          );

          return jsonResponse(response, {
            ...payload,
            rankings: {
              ...(payload?.rankings || {}),
              [activeMarket]: enriched,
            },
          });
        }

        return response;
      } catch {
        return response;
      }
    };

    let current: HTMLElement | null = null;
    let observer: MutationObserver | null = null;
    let stopped = false;

    const findHost = () => {
      if (stopped) return false;

      const next =
        (document.querySelector(
          "section.rankings"
        ) as HTMLElement | null) ||
        (sport === "cfb" ? cfbLegacyRankingHost() : null);

      if (!next) return false;

      if (current && current !== next) {
        current.classList.remove("ssRankingsHost");
      }

      current = next;
      current.classList.add("ssRankingsHost");
      setHost(current);
      return true;
    };

    if (!findHost()) {
      observer = new MutationObserver(() => {
        if (findHost()) observer?.disconnect();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      window.fetch = nativeFetch;
      document.removeEventListener("click", trackMarketClick, true);
      stopped = true;
      observer?.disconnect();
      current?.classList.remove("ssRankingsHost");
      setHost(null);
    };
  }, [pathname, sport]);

  if (!sport || !host) return null;

  return createPortal(
    <PlayerRankingsPanel sport={sport} />,
    host
  );
}
