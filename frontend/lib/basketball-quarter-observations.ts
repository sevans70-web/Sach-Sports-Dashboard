import type {QuarterObservation} from '@/lib/quarter-forecast';
const norm=(v:any)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const number=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
/** Quarter labels are reconciled against BOTH team Q1 scores and each player's
 * full-game official statistic. Full-game participants with no Q1 action can
 * have a certified zero; missing tape/statistics never become zeros. */
export function basketballQuarterObservations(p:any,gameId:string,source:string,retrievedAt:string):QuarterObservation[]{
 const h=p?.header,c=h?.competitions?.[0],time=Date.parse(c?.date||''),at=Date.parse(retrievedAt);
 if(String(h?.id)!==gameId||h?.season?.type!==2||c?.status?.type?.completed!==true||!Number.isFinite(time)||!Number.isFinite(at)||time>=at-48*3600000)return [];
 const sides=c.competitors||[];if(sides.length!==2||sides.some((s:any)=>!s.team?.id)||String(sides[0].team.id)===String(sides[1].team.id))return [];
 const players:any[]=[];
 for(const t of p.boxscore?.players||[])for(const g of t.statistics||[]){
  const labels=g.labels||[],idx=(label:string)=>labels.indexOf(label);
  for(const a of g.athletes||[]){
   if(a.didNotPlay===true)continue;
   const id=String(a.athlete?.id||''),name=String(a.athlete?.displayName||''),raw=a.stats||[],min=String(raw[idx('MIN')]||''),role=/^\d+:\d{2}$/.test(min)?Number(min.split(':')[0])+Number(min.split(':')[1])/60:number(min);
   if(!id||!name||role==null||role<=0)continue;
   const threes=String(raw[idx('3PT')]||'').match(/^(\d+)[-/]\d+$/);
   players.push({id,name,teamId:String(t.team?.id||''),role,starter:a.starter===true,official:{q1_points:number(raw[idx('PTS')]),q1_rebounds:number(raw[idx('REB')]),q1_assists:number(raw[idx('AST')]),q1_threes_made:threes?Number(threes[1]):null}});
  }
 }
 if(!players.length||new Set(players.map(a=>a.id)).size!==players.length||new Set(players.map(a=>norm(a.name))).size!==players.length)return [];
 const byId=new Map(players.map(a=>[a.id,a])),unique=new Map<string,any>();
 for(const play of p.plays||[]){const id=String(play.id||'');if(!id)return [];if(unique.has(id)&&JSON.stringify(unique.get(id))!==JSON.stringify(play))return [];unique.set(id,play)}
 const plays=[...unique.values()],q1=plays.filter(x=>Number(x.period?.number)===1);
 if(!q1.some(x=>x.clock?.displayValue==='12:00')||!q1.some(x=>['0:00','0.0','0'].includes(x.clock?.displayValue))||!plays.some(x=>Number(x.period?.number)>=2))return [];
 const teamPoints=new Map<string,{q1:number;game:number}>(),totals=new Map<string,Record<string,number>>(),quarter=new Map<string,Record<string,number>>();
 const add=(id:string,market:string,value:number,q:number)=>{if(!byId.has(id))return;const t=totals.get(id)||{};t[market]=(t[market]||0)+value;totals.set(id,t);if(q===1){const a=quarter.get(id)||{};a[market]=(a[market]||0)+value;quarter.set(id,a)}};
 for(const play of plays){
  const ids=(play.participants||[]).map((v:any)=>String(v.athlete?.id||'')),first=byId.get(ids[0]),q=Number(play.period?.number),text=String(play.text||''),team=String(play.team?.id||'');
  if(play.scoringPlay===true){
   const value=number(play.scoreValue);if(value==null||value<=0||!first||first.teamId!==team)return [];
   const t=teamPoints.get(team)||{q1:0,game:0};t.game+=value;if(q===1)t.q1+=value;teamPoints.set(team,t);
   add(first.id,'q1_points',value,q);if(value===3)add(first.id,'q1_threes_made',1,q);
   if(/\bassists\b/i.test(text)){
    const assisted=players.filter(a=>ids.includes(a.id)&&text.includes(a.name+' assists'));
    if(assisted.length!==1||assisted[0].teamId!==team)return [];
    add(assisted[0].id,'q1_assists',1,q);
   }
  }
  if(/^(?:Offensive|Defensive) Rebound$/i.test(String(play.type?.text||''))&&first&&first.teamId===team)add(first.id,'q1_rebounds',1,q);
 }
 for(const side of sides){
  const id=String(side.team.id),stats=teamPoints.get(id),line=(side.linescores||[]).find((l:any,i:number)=>Number(l.period?.number??l.period??i+1)===1),q=number(line?.value??line?.displayValue),full=number(side.score);
  if(!stats||q==null||full==null||stats.q1!==q||stats.game!==full)return [];
 }
 return players.flatMap(a=>Object.keys(a.official).flatMap(market=>{
  const actual=a.official[market];if(actual==null||(totals.get(a.id)?.[market]||0)!==actual)return [];
  return [{sport:'nba',season:String(h.season.year),gameId,gameTime:new Date(time).toISOString(),playerId:a.id,playerName:a.name,teamId:a.teamId,market,actual:quarter.get(a.id)?.[market]||0,role:a.role,starter:a.starter,source,retrievedAt}];
 }));
}
