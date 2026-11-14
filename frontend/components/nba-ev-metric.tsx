import {nbaEvNotice,type nbaRankingEv} from '@/lib/nba-ranking-ev';
/** Identical signed EV and visible missing-evidence reasons in both card views. */
export function NbaEvMetric({ev}:{ev:ReturnType<typeof nbaRankingEv>}){
 return <>
  <strong title={nbaEvNotice(ev)} style={{borderColor:ev.status==='available'&&ev.percent>0?'var(--green)':'#686b72'}}>{ev.status==='available'?ev.displayText:'—'}</strong>
  <small data-ev-status={ev.status}>{ev.status==='unavailable'?ev.reason:ev.quoteBasis==='saved_pregame'?'Saved pregame research EV':'Research EV'}</small>
 </>;
}
