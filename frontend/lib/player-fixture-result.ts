import {applyParticipationEvidence, playerStatusNotice} from '@/lib/player-participation';

export function playerFixtureResult(payload: any, sport: string, gameId: string, playerId: string, market: string) {
  const state = payload?.state;
  if (payload?.success !== true || String(payload.gameId) !== gameId ||
      (payload.sport && payload.sport !== sport) || !['pre', 'in', 'post'].includes(state)) return null;
  const row = payload.rows?.find((entry: any) => String(entry.playerId) === playerId);
  const evidence = applyParticipationEvidence({gameId, playerId, gameState: state}, payload, gameId);
  const value = row?.stats?.[market];
  return {
    state: state as 'pre' | 'in' | 'post',
    actual: state !== 'pre' && typeof value === 'number' && Number.isFinite(value) ? value : null,
    notice: playerStatusNotice(evidence, state === 'post' ? 'final' : state === 'in' ? 'live' : 'pregame'),
  };
}
