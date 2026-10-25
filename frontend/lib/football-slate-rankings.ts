export const FOOTBALL_SLATES=['early','afternoon','evening'] as const;
export function footballSlate(time:string){
 const date=new Date(time);if(!Number.isFinite(date.getTime()))return null;
 const hour=Number(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',hour:'2-digit',hourCycle:'h23'}).format(date));
 return hour<15?'early':hour<19?'afternoon':'evening';
}
/** Partition the whole candidate pool BEFORE selecting each slate's leaders. */
export function independentFootballRankings(rows:any[],limit=25){
 return FOOTBALL_SLATES.flatMap(slate=>rows.filter(r=>footballSlate(r.gameTime)===slate).slice(0,limit).map((r,i)=>({...r,originalRank:r.originalRank??r.rank,rank:i+1,slateKey:slate})));
}
export function selectRecordedFootballSlate(snapshots:any[],market:string,day:string,slate:string,lockAt:number){
 const candidates=new Map<string,{at:number,row:any}>();let capturedAt='';
 for(const snapshot of [...snapshots].sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt))){
  const at=Date.parse(snapshot.capturedAt),p=snapshot.payload;
  if(!Number.isFinite(at)||at>=lockAt||p?.market!==market||(p.kind!=null&&p.kind!=='research_rankings'))continue;
  for(const row of p.rows||[]){
   if(footballSlate(row.gameTime)!==slate||!String(row.gameTime).startsWith(day)||at>=Date.parse(row.gameTime))continue;
   const key=row.playerId+'|'+row.gameId;
   candidates.set(key,{at,row});if(at>Date.parse(capturedAt||'1970-01-01'))capturedAt=snapshot.capturedAt;
  }
 }
 const rows=[...candidates.values()].sort((a,b)=>b.at-a.at||Number(a.row.rank)-Number(b.row.rank)).slice(0,25).map(({row,at},i)=>({...row,originalRank:row.rank,rank:i+1,slateKey:slate,boardCapturedAt:new Date(at).toISOString()}));
 return rows.length?{rows,capturedAt}:null;
}
