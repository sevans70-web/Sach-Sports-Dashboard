const easternDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric',
});

type Meeting = { id: string; at: number; date: string; result: string };

function score(value: unknown) {
  const raw = String(value ?? '').trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Only completed meetings between these two teams before the selected fixture. */
export function espnPriorMeetings(summary: any, schedule: any[] = []) {
  const fixture = summary?.header?.competitions?.[0];
  const cutoff = Date.parse(fixture?.date || '');
  const ids: string[] = (fixture?.competitors || []).map((team: any) => String(team?.team?.id || ''));
  if (!Number.isFinite(cutoff) || ids.length !== 2 || ids.some(id => !id) || ids[0] === ids[1]) return [];

  const labels = new Map<string, string>((fixture.competitors || []).map((team: any) =>
    [String(team.team.id), team.team.abbreviation || team.team.displayName]));
  const meetings = new Map<string, Meeting>();
  function add(id: unknown, date: string, awayId: string, homeId: string, awayScore: unknown, homeScore: unknown) {
    const key = String(id || ''), at = Date.parse(date);
    const away = score(awayScore), home = score(homeScore);
    if (!key || key === String(summary.header.id) || !Number.isFinite(at) || at >= cutoff ||
        awayId === homeId || !labels.get(awayId) || !labels.get(homeId) || away == null || home == null) return;
    meetings.set(key, {id: key, at, date: easternDate.format(at), result: `${labels.get(awayId)} ${away} – ${labels.get(homeId)} ${home}`});
  }

  for (const group of summary.lastFiveGames || []) {
    for (const game of group.events || []) {
      if (['W', 'L', 'T'].includes(game.gameResult))
        add(game.id, game.gameDate, String(game.awayTeamId), String(game.homeTeamId), game.awayTeamScore, game.homeTeamScore);
    }
  }
  const series = [...(summary.seasonseries || []), ...(summary.seasonSeries || []), ...(summary.headToHeadGames || [])];
  const events = [...series.flatMap(item => item.events || [item.event || item]), ...schedule];
  for (const event of events) {
    const competition = event.competitions?.[0] || event;
    const status = competition.status?.type || event.statusType;
    if (status?.completed !== true || status.state !== 'post') continue;
    const away = competition.competitors?.find((team: any) => team.homeAway === 'away');
    const home = competition.competitors?.find((team: any) => team.homeAway === 'home');
    add(event.id || competition.id, event.date || competition.date, String(away?.team?.id), String(home?.team?.id),
      away?.score?.displayValue ?? away?.score, home?.score?.displayValue ?? home?.score);
  }
  return [...meetings.values()].sort((a, b) => b.at - a.at).slice(0, 4);
}

export function espnGameComparison(summary: any, sport: string) {
  const fixture = summary?.header?.competitions?.[0];
  const state = fixture?.status?.type?.state;
  if (state !== 'in' && state !== 'post') return '';
  const key = ['nba','cbb','wnba'].includes(sport) ? 'threePointFieldGoalsMade-threePointFieldGoalsAttempted' : 'totalYards';
  const basketball = key.startsWith('threePoint');
  if (!basketball && !['nfl','cfb'].includes(sport)) return '';
  const values = ['away','home'].map(side => {
    const team = fixture.competitors?.find((row: any) => row.homeAway === side)?.team;
    const group = summary.boxscore?.teams?.find((row: any) => team?.id && String(row.team?.id) === String(team.id));
    const value = String(group?.statistics?.find((stat: any) => stat.name === key)?.displayValue || '').trim();
    const match = /^(\d+)-(\d+)$/.exec(value);
    const valid = basketball ? match && Number(match[1]) <= Number(match[2]) : score(value) != null;
    return valid && team.abbreviation ? `${team.abbreviation} ${basketball ? value.replace('-', '-for-') : value}` : '';
  });
  if (values.some(value => !value)) return '';
  return `${basketball ? 'Three-point shooting' : 'Total yards'} ${state === 'post' ? 'at final' : 'so far'}: ${values.join(' · ')}.`;
}

export function nhlPriorMeetings(fixture: any, games: any[]) {
  const cutoff = Date.parse(fixture.startTimeUTC || '');
  const ids = [fixture.awayTeam?.id, fixture.homeTeam?.id];
  if (!Number.isFinite(cutoff) || ids.some(id => id == null) || ids[0] === ids[1]) return [];
  const meetings = new Map<string, Meeting>();
  for (const game of games) {
    const id = String(game.id || '');
    const at = Date.parse(game.startTimeUTC || '');
    const away = game.awayTeam, home = game.homeTeam;
    const a = score(away?.score), h = score(home?.score);
    if (!id || id === String(fixture.id) || !Number.isFinite(at) || at >= cutoff ||
        ![2, 3].includes(game.gameType) || !['OFF', 'FINAL'].includes(game.gameState) ||
        !ids.includes(away?.id) || !ids.includes(home?.id) || away.id === home.id ||
        !away.abbrev || !home.abbrev || a == null || h == null) continue;
    meetings.set(id, {id, at, date: easternDate.format(at), result: `${away.abbrev} ${a} – ${home.abbrev} ${h}`});
  }
  return [...meetings.values()].sort((a, b) => b.at - a.at).slice(0, 4);
}
