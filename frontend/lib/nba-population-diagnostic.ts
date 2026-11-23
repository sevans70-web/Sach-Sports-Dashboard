import {createHash} from 'node:crypto';
import {basketballMarketMatches} from '@/lib/basketball-markets';
import {PUBLIC_PROVIDER_USER_AGENT} from '@/lib/provider-fetch';

export const NBA_CENSUS_MARKETS=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'];
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const bytes=(s:string)=>new TextEncoder().encode(s).byteLength;
const gameFields=['id','gameId','eventId','homeTeam','awayTeam','home_team','away_team','commenceTime','commence_time','startTime','date'];
const bookFields=['key','id','bookmakerId','name','title','lastUpdate'];
const identityFields=['id','playerId','playerID','player_id','athleteId','athlete_id','name','displayName','firstName','lastName','teamId','teamName'];
const propFields=['propId','quoteId','playerId','playerID','player_id','athleteId','athlete_id','gameId','eventId','market','statID','type','periodID','periodId','period','periodName','team','teamName','active','isSuspended','isMain','playerName','player_name','category','line','point','total','overPrice','underPrice','over_price','under_price','lastUpdate','isMainLine','isAlternate','marketStructure','lineType','suspended'];
const scalar=(v:unknown)=>v===null||['string','number','boolean'].includes(typeof v);
function pick(row:any,keys:string[]){
 const out:Record<string,unknown>={};for(const key of keys)if(Object.hasOwn(row||{},key)&&scalar(row[key])){if(typeof row[key]==='string'&&bytes(row[key])>8192)throw Error('census_field_size');out[key]=row[key];}return out;
}
function propEvidence(p:any){
 const out=pick(p,propFields);
 for(const key of ['player','athlete'])if(Object.hasOwn(p,key)){
  if(scalar(p[key]))Object.assign(out,pick(p,[key]));
  else if(p[key]&&typeof p[key]==='object'&&!Array.isArray(p[key]))out[key]=pick(p[key],identityFields);
 }
 return out;
}
/** Every candidate offer is retained, including invalid/suspended/unpriced
 * contracts. Positions are audit coordinates, never invented provider IDs. */
function* offers(payload:any){
 let examined=0,index=0;
 if(!Array.isArray(payload?.data)||payload.data.length>64)throw Error('census_schema_or_game_limit');
 for(const [gi,g]of payload.data.entries()){
  if(!Array.isArray(g?.books)||g.books.length>64)throw Error('census_book_schema_or_limit');
  for(const [bi,b]of g.books.entries()){
   if(!Array.isArray(b?.props))throw Error('census_prop_schema');
   for(const [pi,p]of b.props.entries()){
    if(++examined>100000)throw Error('census_source_prop_limit');
    if(!p||typeof p!=='object')throw Error('census_prop_schema');
    const withoutPeriod={...p};for(const k of ['periodID','periodId','period','periodName'])delete withoutPeriod[k];
    const candidateMarkets=NBA_CENSUS_MARKETS.filter(m=>basketballMarketMatches(withoutPeriod,m));
    if(!candidateMarkets.length)continue;
    if(index>=25000)throw Error('census_candidate_limit');
    const prop=propEvidence(p);
    yield {type:'offer',index:index++,sourcePosition:{game:gi,book:bi,prop:pi},candidateMarkets,matchedMarkets: candidateMarkets.filter(m=>basketballMarketMatches(p,m)),game:pick(g,gameFields),book:pick(b,bookFields),prop,
     sourcePropKeys:Object.keys(p),omittedPropFields:Object.keys(p).filter(k=>!Object.hasOwn(prop,k)),
     omittedIdentityFields:Object.fromEntries(['player','athlete'].filter(k=>p[k]&&typeof p[k]==='object').map(k=>[k,Object.keys(p[k]).filter(f=>!Object.hasOwn((prop[k]||{}) as object,f))]))};
   }
  }
 }
}
/** Two bounded passes: count/hash before headers, then backpressure-driven
 * output. No pagination, independent snapshots, durable cache or truncation. */
export function nbaPopulationResponse(payload:any,observedAt:string,signal?:AbortSignal){
 if(!Number.isFinite(Date.parse(observedAt)))throw Error('census_timestamp');
 const digest=createHash('sha256'),counts:Record<string,number>=Object.fromEntries(NBA_CENSUS_MARKETS.map(m=>[m,0]));
 let count=0,totalBytes=0;
 for(const offer of offers(payload)){
  if(signal?.aborted)throw signal.reason;const line=JSON.stringify(offer)+'\n';totalBytes+=bytes(line);if(totalBytes>16*1024*1024)throw Error('census_response_size');digest.update(line);count++;for(const m of offer.matchedMarkets)counts[m]++;
 }
 const sourceBooks=payload.data.reduce((n:number,g:any)=>n+g.books.length,0),sourceProps=payload.data.reduce((n:number,g:any)=>n+g.books.reduce((b:number,v:any)=>b+v.props.length,0),0);
 const checksum=digest.digest('hex'),snapshot=hash(observedAt+'|'+checksum),iterator=offers(payload),encoder=new TextEncoder();let stage=0,ended=false;
 const stream=new ReadableStream<Uint8Array>({pull(controller){
  if(signal?.aborted){ended=true;iterator.return(undefined);controller.error(signal.reason);return;}
  if(stage===0){stage=1;controller.enqueue(encoder.encode(JSON.stringify({type:'manifest',version:1,sport:'nba',observedAt,snapshot,sourceGames:payload.data.length,sourceBooks,sourceProps,outOfScopeOtherCategories:sourceProps-count,offerCount:count,matchedByMarket:counts,offerBytes:totalBytes,offersSha256:checksum,truncated:false,scope:'All seven-market candidate offers from ONE provider payload. observedAt is the diagnostic read time; original quote timestamps are separate. Raw identity/price evidence, not forecasts or verified official identities.'})+'\n'));return;}
  const next=iterator.next();if(!next.done){controller.enqueue(encoder.encode(JSON.stringify(next.value)+'\n'));return;}
  if(!ended){ended=true;controller.enqueue(encoder.encode(JSON.stringify({type:'complete',snapshot,offerCount:count,offersSha256:checksum})+'\n'));controller.close();}
 },cancel(){ended=true;iterator.return(undefined);}});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

/** Fixed official NBA resources only. No athlete-log retries, alternate host,
 * caller-controlled URL, credentials, mutations or validation/restamping. */
export function nbaDiagnosticSource(query:URLSearchParams,now=Date.now()){
 const kind=query.get('kind'),id=query.get('id')||'',season=query.get('season')||'',date=query.get('date')||'';
 const allowed=new Set(['sport','mode','kind',...(kind==='scoreboard'?['date']:kind==='team_schedule'?['id','season']:['id'])]);
 if([...query.keys()].some(k=>!allowed.has(k)||query.getAll(k).length!==1))throw Error('invalid_source_query');
 const base='https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
 if(kind==='scoreboard'){
  const stamp=Date.parse(date+'T12:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date||Math.abs(stamp-now)>3*86400000)throw Error('invalid_source_date');
  return {kind,url:base+'/scoreboard?limit=200&dates='+date.replaceAll('-',''),keys:['events','leagues']};
 }
 if(!/^\d{1,12}$/.test(id))throw Error('invalid_source_id');
 if(kind==='summary')return {kind,url:base+'/summary?event='+id,keys:['header','boxscore','injuries']};
 if(kind==='roster')return {kind,url:base+'/teams/'+id+'/roster',keys:['team','athletes']};
 const d=new Date(now),current=d.getUTCFullYear()+(d.getUTCMonth()>=8?1:0);
 if(kind==='team_schedule'&&season===String(current))return {kind,url:base+'/teams/'+id+'/schedule?season='+season+'&seasontype=2',keys:['status','timestamp','season','requestedSeason','team','events']};
 throw Error('invalid_source_kind_or_season');
}
function retryTime(value:string|null,now:number,minimum:number){const n=value==null?NaN:Number(value),d=value==null?NaN:Date.parse(value);return Math.max(now+minimum,Number.isFinite(n)?now+n*1000:Number.isFinite(d)?d:0);}
export function createNbaOfficialDiagnostic(fetcher:typeof fetch=(...args)=>globalThis.fetch(...args)){
 let active=0;const cooldowns=new Map<string,number>();
 return async(request:Request)=>{
  let source:ReturnType<typeof nbaDiagnosticSource>;try{source=nbaDiagnosticSource(new URL(request.url).searchParams);}catch{return Response.json({error:'Invalid bounded NBA source query'},{status:400});}
  const now=Date.now();for(const[k,v]of cooldowns)if(v<=now)cooldowns.delete(k);
  const until=Math.max(cooldowns.get(source.url)||0,cooldowns.get('origin')||0);
  if(until>now)return Response.json({reason:'recorded_source_cooldown',source:source.url,retryAt:new Date(until).toISOString()},{status:429,headers:{'Cache-Control':'no-store','Retry-After':String(Math.ceil((until-now)/1000))}});
  if(active>=2)return Response.json({reason:'diagnostic_busy'},{status:429,headers:{'Retry-After':'1','Cache-Control':'no-store'}});
  active++;let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,canceling:Promise<void>|undefined;const signal=AbortSignal.any([request.signal,AbortSignal.timeout(8000)]);
  const cancel=()=>{canceling=reader?.cancel(signal.reason).catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{
   response=await fetcher(source.url,{method:'GET',headers:{Accept:'application/json','User-Agent':PUBLIC_PROVIDER_USER_AGENT},cache:'no-store',redirect:'manual',signal});
   if(!response.ok){
    const status=response.status;if([403,429].includes(status)){
     if(cooldowns.size>=64)cooldowns.delete(cooldowns.keys().next().value!);
     cooldowns.set(status===429?'origin':source.url,retryTime(response.headers.get('Retry-After'),Date.now(),status===429?60000:3600000));
    }
    await response.body?.cancel();return Response.json({source:source.url,sourceStatus:status,observedAt:new Date().toISOString(),durationMs:Date.now()-now,responseDate:response.headers.get('Date'),responseAge:response.headers.get('Age'),upstreamRay:response.headers.get('CF-Ray'),retryAfter:response.headers.get('Retry-After'),reason:status===403?'official_source_access_denied':status===429?'official_source_rate_limited':status>=300&&status<400?'official_source_redirect_rejected':'official_source_http_error'},{status:503,headers:{'Cache-Control':'no-store'}});
   }
   reader=response.body?.getReader();if(!reader)throw Error('source_body_missing');
   const parts:Uint8Array[]=[];let size=0;for(;;){if(signal.aborted)throw signal.reason;const part=await reader.read();if(signal.aborted)throw signal.reason;if(part.done)break;size+=part.value.byteLength;if(size>2*1024*1024)throw Error('source_body_limit');parts.push(part.value);}
   const body=new Uint8Array(size);let offset=0;for(const p of parts){body.set(p,offset);offset+=p.length;}
   const parsed=JSON.parse(new TextDecoder().decode(body));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('source_schema');
   const payload=Object.fromEntries(source.keys.filter(k=>Object.hasOwn(parsed,k)).map(k=>[k,k==='boxscore'?{players:parsed.boxscore?.players}:parsed[k]]));
   return Response.json({version:1,source:source.url,kind:source.kind,sourceStatus:response.status,requestStartedAt:new Date(now).toISOString(),observedAt:new Date().toISOString(),durationMs:Date.now()-now,responseDate:response.headers.get('Date'),responseAge:response.headers.get('Age'),lastModified:response.headers.get('Last-Modified'),etag:response.headers.get('ETag'),upstreamRay:response.headers.get('CF-Ray'),rawBodySha256:createHash('sha256').update(body).digest('hex'),payloadSha256:hash(JSON.stringify(payload)),payload,scope:'Actual unvalidated official source receipt. Validate unchanged model completeness/freshness rules offline; no production evidence written.'},{headers:{'Cache-Control':'no-store'}});
  }catch(error){await reader?.cancel().catch(()=>{});if(!reader)await response?.body?.cancel().catch(()=>{});return Response.json({source:source.url,reason:signal.aborted?'official_source_canceled_or_timeout':'official_source_body_invalid',observedAt:new Date().toISOString()},{status:503,headers:{'Cache-Control':'no-store'}});}
  finally{signal.removeEventListener('abort',cancel);await canceling;reader?.releaseLock();active--;}
 };
}
