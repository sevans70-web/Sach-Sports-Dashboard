"use client";

import {useEffect, useState} from 'react';
import {playerFixtureResult} from '@/lib/player-fixture-result';
import {visiblePolling} from '@/lib/visible-polling';

const endpoint: Record<string, string> = {
  nba: 'basketball', wnba: 'basketball', cbb: 'basketball',
  nfl: 'football', cfb: 'football', nhl: 'nhl',
};

export function usePlayerFixtureResult(sport: string, gameId: string, playerId: string, market: string) {
  const source = endpoint[sport];
  const enabled = Boolean(source && /^\d+$/.test(gameId) && /^\d+$/.test(playerId));
  const key = JSON.stringify([sport, gameId, playerId, market]);
  const [result, setResult] = useState<{key: string; value: NonNullable<ReturnType<typeof playerFixtureResult>>} | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const query = new URLSearchParams({sport, gameId});
    let busy = false;
    let final = false;

    const load = async () => {
      if (busy || final) return;
      busy = true;
      try {
        const response = await fetch(`/api/${source}/live-player-stats?${query}`, {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) return;
        const value = playerFixtureResult(await response.json(), sport, gameId, playerId, market);
        if (!value || controller.signal.aborted) return;
        final = value.state === 'post' && (value.actual != null || value.notice != null);
        setResult({key, value});
      } catch {
        // Retry on the next visible poll.
      } finally {
        busy = false;
      }
    };

    void load();
    const stop = visiblePolling(load, 15000);
    return () => { stop(); controller.abort(); };
  }, [enabled, source, key, sport, gameId, playerId, market]);

  return {enabled, result: result?.key === key ? result.value : null};
}
