import {basketballMarketMatches} from '@/lib/basketball-markets';
const markets=new Set(['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts']);
const allowed=(row:any,keys:string[])=>Object.fromEntries(keys.filter(k=>['string','number','boolean'].includes(typeof row?.[k])||row!=null&&Object.hasOwn(row,k)&&row[k]===null).map(k=>[k,row[k]]));
const present=(v:unknown)=>['string','number'].includes(typeof v)&&String(v).trim()!=='';
const numeric=(v:unknown)=>present(v)&&Number.isFinite(Number(v))?Number(v):null;
/** Read-only public source evidence. No generated IDs, inferred periods, copied
 * forecasts or reconstructed prices. Counts describe this bounded sample only. */
export function nbaFeedSample(payload:any,market='points',limit=2,now=Date.now()){
 if(!validNbaFeedSample(market,limit))throw Error('invalid_nba_feed_sample');
 if(!Array.isArray(payload?.data))throw Object.assign(Error('invalid_nba_feed_payload'),{diagnostic:{code:'provider_invalid_schema'}});
 const sourceGames=payload.data,gaps:Record<string,number>={};
 let matchedProps=0,returnedProps=0,booksOmitted=0,propsOmitted=0;
 const gap=(key:string)=>{gaps[key]=(gaps[key]||0)+1;};
 const games=sourceGames.slice(0,30).map((g:any)=>{
  const sourceBooks=Array.isArray(g.books)?g.books:[];booksOmitted+=Math.max(0,sourceBooks.length-12);
  return {...allowed(g,['id','gameId','eventId','homeTeam','awayTeam','home_team','away_team','commenceTime','commence_time','startTime','date']),books:sourceBooks.slice(0,12).map((b:any)=>{
   const matches=(Array.isArray(b.props)?b.props:[]).filter((p:any)=>basketballMarketMatches(p,market));matchedProps+=matches.length;propsOmitted+=Math.max(0,matches.length-limit);
   return {...allowed(b,['key','name','lastUpdate']),props:matches.slice(0,limit).map((p:any)=>{
    returnedProps++;
    if(!present(p.propId))gap('provider_prop_id_missing');
    if(![p.playerId,p.playerID,p.athleteId].some(present))gap('provider_player_id_missing');
    if(![g.id,g.gameId,g.eventId].some(present))gap('provider_game_id_missing');
    const start=Date.parse(g.commenceTime||g.commence_time||g.startTime||g.date||'');if(!Number.isFinite(start))gap('fixture_time_missing_or_invalid');else if(start<=now)gap('started_fixture');
    const away=String(g.awayTeam||g.away_team||'').trim(),home=String(g.homeTeam||g.home_team||'').trim();if(!away||!home||away===home)gap('fixture_teams_missing_or_ambiguous');
    if(![p.periodID,p.periodId,p.period,p.periodName].some(present))gap('explicit_period_missing');
    if(![p.playerName,p.player].some(present))gap('player_name_missing');
    if(!present(b.key))gap('sportsbook_key_missing');
    for(const key of ['gameId','eventId'])if(present(p[key])&&present(g[key])&&String(p[key])!==String(g[key]))gap('provider_'+key+'_mismatch');
    const line=numeric(p.line??p.point??p.total);if(line==null||line<0||!Number.isInteger(line*2))gap('invalid_or_missing_line');
    if([p.overPrice,p.underPrice].some(v=>numeric(v)==null||Math.abs(Number(v))<100))gap('incomplete_two_sided_prices');
    const stamp=Date.parse(p.lastUpdate||b.lastUpdate||'');
    if(!Number.isFinite(stamp))gap('quote_timestamp_missing');else if(stamp>now+60000)gap('future_quote_timestamp');else if(now-stamp>15*60000)gap('stale_quote_timestamp');
    if(p.suspended===true||p.isSuspended===true||p.active===false)gap('inactive_or_suspended');
    if(p.isAlternate===true||p.isMain===false||p.isMainLine===false)gap('not_main_market');
    return allowed(p,['propId','quoteId','playerId','playerID','athleteId','gameId','eventId','market','statID','type','periodID','periodId','period','periodName','team','teamName','active','isSuspended','isMain','playerName','player','category','line','point','total','overPrice','underPrice','lastUpdate','isMainLine','isAlternate','marketStructure','lineType','suspended']);
   })};
  })};
 });
 return {sport:'nba',market,limit,scope:'Bounded source sample, not a full player inventory or a prediction. Provider identities, periods, timestamps and prices are preserved when supplied. Official roster/game matching remains required.',games,diagnostics:{sourceGames:sourceGames.length,returnedGames:games.length,matchedPropsInReturnedBooks:matchedProps,returnedProps,gamesOmitted:Math.max(0,sourceGames.length-30),booksOmitted,propsOmitted,truncated:sourceGames.length>30||booksOmitted>0||propsOmitted>0,evidenceGaps:gaps,officialIdentityMatchVerified:false}};
}
export function validNbaFeedSample(market:string,limit:number){return markets.has(market)&&Number.isInteger(limit)&&limit>=1&&limit<=25;}

/** Shared native Response handler for the app and the isolated diagnostic-only
 * release. load() uses the existing bound provider; no caller-controlled URL. */
export async function readNbaFeedDiagnostic(query:URLSearchParams,load:()=>Promise<any>,failureCategory:(error:unknown)=>string){
 const market=query.get('market')||'points',rawLimit=query.get('limit'),limit=rawLimit==null?2:Number(rawLimit);
 if(!validNbaFeedSample(market,limit))return Response.json({error:'Choose a supported NBA market and an integer limit from 1 to 25.'},{status:400,headers:{'Cache-Control':'no-store'}});
 try{return Response.json({...nbaFeedSample(await load(),market,limit),updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({error:'NBA quote sample unavailable',reason:failureCategory(error)},{status:503,headers:{'Cache-Control':'no-store'}})}
}
