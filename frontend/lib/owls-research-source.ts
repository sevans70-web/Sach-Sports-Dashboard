import {providerFetch} from '@/lib/provider-fetch';

// Fixed, outcome-independent collection windows. This uses included Rookie
// routes only. It never reads the restricted backfill archive or changes billing.
export const RESEARCH_DATES={
 nfl:['2026-09-06','2026-09-13','2026-09-20','2026-09-27','2026-10-04','2026-10-11','2026-10-18','2026-10-02','2026-10-05','2026-10-06','2026-10-09','2026-10-12','2026-10-13'],
 nba:['2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-07'],
} as const;
const markets={nfl:new Set(['passing_yards','rushing_yards','receiving_yards','receptions']),nba:new Set(['points','rebounds','assists','threes_made','steals','blocks'])};
const cache=new Map<string,{until:number;value?:any;error?:string}>();
const pending=new Map<string,Promise<any>>();
let cooldown=0;
async function read(sport:'nfl'|'nba',endpoint:'results'|'history'|'trends',query:Record<string,string>){
 const key=sport+'/props/'+endpoint+'?'+new URLSearchParams(query),hit=cache.get(key);
 if(hit&&hit.until>Date.now()){if(hit.error)throw Error(hit.error);return hit.value}
 if(cooldown>Date.now())throw Error('Included research source is cooling down');
 if(pending.has(key))return pending.get(key);
 const work=(async()=>{
  const token=process.env.OWLS_INSIGHT_API_KEY?.trim();if(!token)throw Error('Book feed is not configured');
  const r=await providerFetch('https://api.owlsinsight.com/api/v1/'+key,{headers:{Authorization:'Bearer '+token,'x-api-key':token,Accept:'application/json'},cache:'no-store'});
  if(!r.ok){const error='Included research source returned '+r.status;
   if([401,402,403,429].includes(r.status))cooldown=Date.now()+Math.max(60_000,Math.min(3600_000,(Number(r.headers.get('retry-after'))||60)*1000));
   cache.set(key,{until:Math.max(Date.now()+60_000,cooldown),error});throw Error(error);
  }
  const value=await r.json();if(value?.success===false)throw Error('Included research source rejected the request');
  // Bound memory without adding persistent writes or touching archive retention.
  if(cache.size>=512)cache.delete(cache.keys().next().value!);
  cache.set(key,{until:Date.now()+3600_000,value});return value;
 })();pending.set(key,work);try{return await work}finally{pending.delete(key)}
}
function fields(row:any,keys:string[]){return Object.fromEntries(keys.filter(k=>['string','number','boolean'].includes(typeof row?.[k])).map(k=>[k,row[k]]))}
const quoteKeys=['line','overPrice','underPrice','timestamp','recordedAt','capturedAt','updatedAt','isMain','isMainLine','marketStructure','capturePhase'];
export function researchIdentities(payload:any,sport:'nfl'|'nba'){
 const entries=Array.isArray(payload?.data)?payload.data:[],ids=new Map<string,any>();
 // Select by recorded identity/category, never by actual, grade, side or return.
 for(const r of entries){if(!r?.playerId||typeof r.playerName!=='string'||!markets[sport].has(r.category))continue;
  const key=String(r.playerId)+'|'+r.category;
  if(ids.has(key)&&ids.get(key).playerName!==r.playerName)throw Error('Ambiguous source player identity');
  ids.set(key,{playerId:String(r.playerId),playerName:r.playerName,category:r.category});
 }
 return [...ids.values()].sort((a,b)=>a.playerId.localeCompare(b.playerId)||a.category.localeCompare(b.category));
}
// Results grading is not a fixture census. NBA history may exist even when
// that separate index is empty. Select official identities without using stats.
export function officialNbaResearchFixtures(boards:any[],date:string){
 const fixtures=new Map<string,string>();
 for(const board of boards)for(const e of board?.events||[]){
  const c=e.competitions?.[0],teams=c?.competitors||[];
  if(String(e.date).slice(0,10)!==date||c?.status?.type?.completed!==true)continue;
  const away=teams.find((t:any)=>t.homeAway==='away')?.team?.displayName,home=teams.find((t:any)=>t.homeAway==='home')?.team?.displayName;
  if(typeof away!=='string'||typeof home!=='string'||!/^\d+$/.test(String(e.id)))continue;
  fixtures.set('nba:'+away+'@'+home+'-'+date.replaceAll('-',''),String(e.id));
 }
 return fixtures;
}
export function officialNbaResearchIdentities(payload:any){
 const rows=[];
 for(const team of payload?.boxscore?.players||[])for(const section of team.statistics||[])for(const row of section.athletes||[]){
  const a=row.athlete;if(!a?.id||typeof a.displayName!=='string')continue;
  for(const category of markets.nba)rows.push({playerId:String(a.id),playerName:a.displayName,category});
 }
 return researchIdentities({data:rows},'nba');
}
async function officialJson(url:string){
 const hit=cache.get(url);if(hit&&hit.until>Date.now()&&hit.value)return hit.value;
 const r=await providerFetch(url,{cache:'no-store'});if(!r.ok)throw Error('Official research identities returned '+r.status);
 const value=await r.json();cache.set(url,{until:Date.now()+3600_000,value});return value;
}
export async function includedResearchSource(sport:'nfl'|'nba',day:number,game:number|null,entry:number|null){
 if(!Number.isInteger(day)||day<0||day>=RESEARCH_DATES[sport].length)throw Error('Invalid research day');
 const date=RESEARCH_DATES[sport][day];
 const discovery=await read(sport,'results',{date});
 if(discovery?.meta?.gamesTruncated===true)throw Error('Truncated research discovery');
 let games=(Array.isArray(discovery?.data)?discovery.data:[]).map((r:any)=>String(r.gameId??r.eventId??''))
  .filter((id:string)=>id.startsWith(sport+':')&&id.endsWith(date.replaceAll('-',''))&&id.length<=200&&!/[\x00-\x1f\x7f]/.test(id)).sort();
 let officialFixtures=new Map<string,string>();
 if(sport==='nba'&&!games.length){
  const previous=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const boards=await Promise.all([previous,date].map(d=>officialJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+d.replaceAll('-','')+'&limit=1000')));
  officialFixtures=officialNbaResearchFixtures(boards,date);games=[...officialFixtures.keys()].sort();
 }
 const discoverySource=officialFixtures.size?'official_fixture_census':'provider_results_index';
 const base={sport,date,dates:RESEARCH_DATES[sport],games,discoverySource,retrievedAt:new Date().toISOString()};
 if(game===null)return base;
 if(!Number.isInteger(game)||game<0||game>=games.length)throw Error('Invalid research fixture');
 const gameId=games[game],results=await read(sport,'results',{game_id:gameId});
 if(results?.meta?.actualsTruncated===true)throw Error('Truncated research identities');
 let identities=researchIdentities(results,sport);
 if(!identities.length&&officialFixtures.has(gameId)){
  const summary=await officialJson('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+officialFixtures.get(gameId));
  identities=officialNbaResearchIdentities(summary);
 }
 if(entry===null)return {...base,gameId,identities};
 if(!Number.isInteger(entry)||entry<0||entry>=identities.length)throw Error('Invalid research entry');
 const identity=identities[entry],book='pinnacle';
 const history=await read(sport,'history',{game_id:gameId,player:identity.playerName,category:identity.category,book});
 const data=history?.data,points=Array.isArray(data?.history)?data.history:[];
 return {...base,gameId,identity,book,
  historyIdentity:fields(data,['gameId','player','category','book','isMain','marketStructure']),
  opening:fields(data?.openingLine??data?.opening,quoteKeys),history:points.map((p:any)=>fields(p,quoteKeys)),
  source:'https://api.owlsinsight.com/api/v1/'+sport+'/props/history',
  sourceTruncated:history?.meta?.historyTruncated===true||history?.meta?.truncated===true,
  historyKeys:Object.keys(data||{}),pointKeys:points[0]?Object.keys(points[0]):[],
 };
}
