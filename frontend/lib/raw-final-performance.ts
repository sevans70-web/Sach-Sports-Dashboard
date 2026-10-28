import {extractAppearances,hasSoccerMetric} from '@/lib/soccer-history';
const number=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
/** Exact official fixture, explicit final state and explicit participating-player stats only. */
export function rawFinalPerformance(sport:string,gameId:string,raw:any,observedAt?:string){
 const rows:any[]=[];
 if(sport==='mlb'){
  if(String(raw?.gamePk)!==gameId||raw?.gameData?.status?.abstractGameState!=='Final')return null;
  for(const side of ['home','away'])for(const p of Object.values(raw.liveData?.boxscore?.teams?.[side]?.players||{}) as any[]){
   const id=String(p.person?.id||'');if(!id)continue;const b=p.stats?.batting||{},pit=p.stats?.pitching||{},stats:any={};
   if((number(b.plateAppearances)??number(b.atBats)??0)>0||number(b.gamesPlayed)===1){
    for(const [m,k] of Object.entries({hits:'hits',home_runs:'homeRuns',total_bases:'totalBases',runs:'runs',rbis:'rbi',walks:'baseOnBalls',stolen_bases:'stolenBases',batter_strikeouts:'strikeOuts'})){const v=number(b[k]);if(v!=null)stats[m]=v;}
    if(['hits','runs','rbis'].every(k=>stats[k]!=null))stats.hits_runs_rbis=stats.hits+stats.runs+stats.rbis;
   }
   if((number(pit.battersFaced)??0)>0||(number(pit.outs)??0)>0){
    for(const [m,k] of Object.entries({strikeouts:'strikeOuts',hits_allowed:'hits',walks_allowed:'baseOnBalls',earned_runs:'earnedRuns'})){const v=number(pit[k]);if(v!=null)stats[m]=v;}
    const ip=String(pit.inningsPitched??'').match(/^(\d+)(?:\.([012]))?$/);const outs=number(pit.outs)??(ip?Number(ip[1])*3+Number(ip[2]||0):null);if(outs!=null)stats.outs_recorded=outs;
   }
   if(Object.keys(stats).length)rows.push({playerId:id,stats});
  }
 }else if(sport==='soccer'){
  const c=raw?.header?.competitions?.[0],s=c?.status?.type||raw?.header?.status?.type;
  if(String(raw?.header?.id||c?.id)!==gameId||!(s?.completed===true||s?.state==='post'))return null;
  for(const p of extractAppearances(raw,{gameId,gameDate:c?.date||''})){
   if(p.played===false||!(p.played===true||p.minutes>0))continue;const stats:any={};
   for(const m of ['shots','shots_on_target','goals','assists','saves'] as const)if(hasSoccerMetric(p,m)&&Number.isFinite(p[m]))stats[m]=p[m];
   if(Object.keys(stats).length)rows.push({playerId:String(p.playerId),stats});
  }
 }else return null;
 return rows.length?{success:true,gameId,state:'post',rows,updatedAt:observedAt||new Date().toISOString(),source:sport==='mlb'?'MLB Stats API':'ESPN'}:null;
}
