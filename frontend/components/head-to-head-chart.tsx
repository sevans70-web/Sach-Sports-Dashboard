"use client";

import {useEffect, useState} from "react";
import {playerFixtureOpponent, playerMatchupHistory} from "@/lib/card-intelligence";
import {playerCardHistory, type PlayerHistoryPoint} from "@/lib/player-card-history";
import {RecentChart} from "./recent-player-chart";
import styles from "./recent-player-chart.module.css";

type Opponent = {name: string; aliases: string[]};

export function HeadToHeadChart({
  sport, league, playerId, gameId, gameTime, team, matchup, market, statLabel, historyUrl,
  recent, opponent, line,
}: {
  sport: string;
  league: string;
  playerId: string;
  gameId: string;
  gameTime: string;
  team: string;
  matchup: string;
  market: string;
  statLabel: string;
  historyUrl: string;
  recent: PlayerHistoryPoint[];
  opponent?: Opponent | null;
  line: number | null;
}) {
  const [resolved, setResolved] = useState<Opponent | null>(null);
  const [points, setPoints] = useState<PlayerHistoryPoint[]>([]);
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  const fixtureKnown = Number.isFinite(Date.parse(gameTime)) && Boolean(gameId || matchup);

  useEffect(() => {
    if (!fixtureKnown || opponent !== undefined || !gameId) return;
    const controller = new AbortController();
    playerFixtureOpponent(sport, gameId, playerId, team, league, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResolved(value); });
    return () => controller.abort();
  }, [fixtureKnown, opponent, sport, gameId, playerId, team, league]);

  useEffect(() => {
    if (!fixtureKnown) return;
    const controller = new AbortController();
    const query = new URLSearchParams({before: gameTime, view: "head-to-head"});
    fetch(`${historyUrl}${historyUrl.includes("?") ? "&" : "?"}${query}`, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("History unavailable");
      const payload = await response.json();
      if (payload.success === false) throw new Error("History unavailable");
      if (!controller.signal.aborted) setPoints(playerCardHistory(payload, sport, market, gameTime, gameId, true, 200));
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false);
    });
    return () => controller.abort();
  }, [fixtureKnown, historyUrl, sport, market, gameTime, gameId]);

  if (!fixtureKnown) return <p className={styles.chartReadout}>Open a player card from a matchup to see head-to-head results.</p>;

  const currentOpponent = opponent ?? resolved;
  const history = playerMatchupHistory({
    gameId, gameTime, teamName: team, matchup, opponentName: currentOpponent?.name,
    opponentAliases: currentOpponent?.aliases,
  }, [...recent, ...points]);

  if (!history.meetings.length) return <p className={styles.chartReadout} role="status">
    {pending ? "Loading head-to-head results…" : failed ? "Head-to-head history is currently unavailable." :
      history.opponent ? `No recorded ${statLabel} against ${history.opponent} in the available game logs.` :
        "The opponent could not be confirmed for this matchup."}
  </p>;

  return <>
    <p className={styles.chartReadout}>vs. {history.opponent} · Up to 5 prior meetings</p>
    <RecentChart key={history.meetings.map(point => point.gameId || point.date).join("|")}
      points={history.meetings} span={history.meetings.length} statLabel={statLabel}
      line={line} projection={null} headToHead />
  </>;
}
