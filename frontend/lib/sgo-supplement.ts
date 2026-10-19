import {providerFetch} from "@/lib/provider-fetch";
const global=globalThis as typeof globalThis&{__sachSgoOdds?:{cache:Map<string,{at:number;data:any}>;pending:Map<string,Promise<any>>;cooldownUntil:number}};
const state=global.__sachSgoOdds??(global.__sachSgoOdds={cache:new Map(),pending:new Map(),cooldownUntil:0});
const {cache,pending}=state;
/** Uses the same configured credentials as NFL/CFB, without extra setup. */
export async function getSgoSupplement(leagueID:string){
 const key=process.env.SPORTSGAMEODDS_API_KEY||process.env.SPORTS_GAME_ODDS_API_KEY||process.env.SPORTSGAMEODDS_KEY;
 if(!key)return {data:[],warning:"Supplemental odds provider is not configured."};
 const hit=cache.get(leagueID);if(hit&&Date.now()-hit.at<300_000)return hit.data;
 if(Date.now()<state.cooldownUntil)return {data:[],warning:"Supplemental odds rate limit: waiting for provider retry window."};
 const running=pending.get(leagueID);if(running)return running;
 const work=(async()=>{try{
  const qs=new URLSearchParams({leagueID,oddsAvailable:"true",finalized:"false",includeOpposingOdds:"true",includeAltLines:"false",startsAfter:new Date(Date.now()-86400000).toISOString(),startsBefore:new Date(Date.now()+10*86400000).toISOString(),limit:"100"});
  const response=await providerFetch(`https://api.sportsgameodds.com/v2/events?${qs}`,{headers:{"x-api-key":key,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!response.ok){
   if(response.status===429){const raw=response.headers.get("retry-after"),seconds=Number(raw),date=Date.parse(raw||"");state.cooldownUntil=Date.now()+Math.min(3600000,Math.max(60_000,Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?date-Date.now():60_000))}
   throw new Error(`Supplemental odds returned ${response.status}`);
  }
  const data=await response.json();cache.set(leagueID,{at:Date.now(),data});return data;
 }catch(e){const data={data:[],warning:e instanceof Error?e.message:String(e)};cache.set(leagueID,{at:Date.now(),data});return data}})();
 pending.set(leagueID,work);try{return await work}finally{pending.delete(leagueID)}
}
export function sgoPlayerName(event:any,odd:any){
 const id=String(odd.playerID||odd.statEntityID||""),p=event.players?.[id];
 return String(odd.statEntityName||odd.playerName||odd.statEntity?.name||p?.name||p?.displayName||[p?.firstName,p?.lastName].filter(Boolean).join(" ")||"");
}

/** Root byBookmaker quotes are the documented main prices. Never read
 * consensus bookOdds/bookOverUnder or descend into alternative rungs. */
export function sgoBookGames(payload:any){
 const numeric=(v:any)=>v==null||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
 const norm=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 return (Array.isArray(payload?.data)?payload.data:[]).filter((event:any)=>!event.status?.cancelled).map((event:any)=>{
  const books=new Map<string,any[]>(),odds=event.odds||{};
  for(const [id,odd]of Object.entries(odds) as [string,any][]){
   const pid=String(odd.playerID||odd.statEntityID||''),name=sgoPlayerName(event,odd),period=String(odd.periodID||''),stat=String(odd.statID||'');
   if(!pid||['all','home','away'].includes(pid)||!name||!stat||!period||odd.isAlternate===true||odd.isMainLine===false)continue;
   const scorer=['firstbasket','firstscorer','firsttouchdown','firsttouchdownscorer'].includes(norm(stat));
   if(scorer?odd.sideID!=='yes'||!['yn','ml'].includes(odd.betTypeID):odd.sideID!=='over'||odd.betTypeID!=='ou')continue;
   const opposing=odds[odd.opposingOddID];
   if(!scorer&&(!opposing||opposing.sideID!=='under'||opposing.betTypeID!=='ou'||String(opposing.playerID||opposing.statEntityID)!==pid||opposing.statID!==stat||opposing.periodID!==period))continue;
   for(const [book,over]of Object.entries(odd.byBookmaker||{}) as [string,any][]){
    const under=opposing?.byBookmaker?.[book],line=numeric(over.overUnder),updated=Date.parse(over.lastUpdatedAt);
    if(over.available!==true||!Number.isFinite(updated))continue;
    if(!scorer&&(under?.available!==true||line==null||numeric(under.overUnder)!==line||!Number.isFinite(Date.parse(under.lastUpdatedAt))))continue;
    const lastUpdate=new Date(scorer?updated:Math.min(updated,Date.parse(under.lastUpdatedAt))).toISOString();
    const prop={playerName:name,category:stat,periodID:period,line:scorer?null:line,overPrice:numeric(over.odds),underPrice:scorer?null:numeric(under.odds),lastUpdate,marketStructure:'main',propId:`sgo-${event.eventID}-${id}-${book}`,event_link:over.deeplink||''};
    books.set(book,[...(books.get(book)||[]),prop]);
   }
  }
  return {gameId:String(event.eventID||''),awayTeam:event.teams?.away?.names?.long||event.teams?.away?.name||event.awayTeamName||'',homeTeam:event.teams?.home?.names?.long||event.teams?.home?.name||event.homeTeamName||'',commenceTime:event.status?.startsAt||event.startsAt||'',books:[...books].map(([key,props])=>({key,title:key,props}))};
 });
}
export const sgoNbaGames=sgoBookGames;
