import {dashboardDay} from '@/lib/dashboard-contract';
export const FOOTBALL_SLATES=['early','afternoon','evening'] as const;
const footballDay=(value:string)=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):null;};
export function footballSlate(time:string){
 const date=new Date(time);if(!Number.isFinite(date.getTime()))return null;
 const hour=Number(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',hour:'2-digit',hourCycle:'h23'}).format(date));
 return hour<15?'early':hour<19?'afternoon':'evening';
}
/** Partition the whole candidate pool BEFORE selecting each slate's leaders. */
export function independentFootballRankings(rows:any[],limit=25,day?:string){
 if(day)rows=rows.filter(r=>{const d=new Date(r.gameTime);return Number.isFinite(d.getTime())&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)===day});
 return FOOTBALL_SLATES.flatMap(slate=>rows.filter(r=>footballSlate(r.gameTime)===slate).slice(0,limit).map((r,i)=>({...r,originalRank:r.originalRank??r.rank,rank:i+1,slateKey:slate})));
}
export function selectRecordedFootballSlate(snapshots:any[],market:string,day:string,slate:string,lockAt:number){
 const candidates=new Map<string,{at:number,row:any}>();let capturedAt='';
 for(const snapshot of [...snapshots].sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt))){
  const at=Date.parse(snapshot.capturedAt),p=snapshot.payload;
  if(!Number.isFinite(at)||at>=lockAt||p?.market!==market||(p.kind!=null&&p.kind!=='research_rankings'))continue;
  for(const row of p.rows||[]){
   if(footballSlate(row.gameTime)!==slate||footballDay(row.gameTime)!==day||at>=Date.parse(row.gameTime))continue;
   const key=row.playerId+'|'+row.gameId;
   candidates.set(key,{at,row});if(at>Date.parse(capturedAt||'1970-01-01'))capturedAt=snapshot.capturedAt;
  }
 }
 const rows=[...candidates.values()].sort((a,b)=>(Number.isFinite(Number(a.row.rank))&&Number(a.row.rank)>0?Number(a.row.rank):Infinity)-(Number.isFinite(Number(b.row.rank))&&Number(b.row.rank)>0?Number(b.row.rank):Infinity)||b.at-a.at).slice(0,25).map(({row,at},i)=>({...row,originalRank:row.rank,rank:i+1,slateKey:slate,boardCapturedAt:new Date(at).toISOString()}));
 return rows.length?{rows,capturedAt}:null;
}

/** Show the nearest future day with an actual qualifying sportsbook quote. */
export function nearestQuotedFootballDay(rows:any[],preferred:string,today:string){
 const date=(v:string)=>{const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):null};
 const dates=[...new Set(rows.map(row=>date(String(row.gameTime||''))).filter((d):d is string=>d!==null&&d>=today))].sort();
 return dates.includes(preferred)?preferred:(dates[0]||preferred);
}

/** Keep yesterday's entire board while one of its games is still live. */
export function activeFootballBoardDay(games:any[],now=new Date()){
 const today=dashboardDay(now);
 const liveDays=games.filter(g=>g.state==='in').map(g=>dashboardDay(g.date||g.gameTime||'')).filter(d=>d&&d<=today).sort();
 return liveDays[0]||today;
}
