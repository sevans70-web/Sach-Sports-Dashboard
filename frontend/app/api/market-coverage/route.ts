import {NextRequest,NextResponse} from 'next/server';
import {getOwlsPayload,getOwlsBet365Payload,getOwlsArchiveCoverage,getOwlsArchiveValidationSample,getOwlsIncludedResultsSample,getOwlsNbaPeriodSourceCoverage} from '@/lib/owls-provider';
import {footballBookRows} from '@/lib/football-book-quotes';
import {getSgoSupplement,sgoBookGames} from '@/lib/sgo-supplement';
import {inspectOwlsResultEvidence} from '@/lib/owls-result-evidence';
export const dynamic='force-dynamic';
/** Read-only catalog diagnostics. No credentials, account information or raw
 * account records are returned; snapshots share the provider request cache.
 * The archive probe exposes only bounded public quote fields, never outcomes. */
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport');if(sport!=='nfl'&&sport!=='nba')return NextResponse.json({error:'Unsupported sport'},{status:400});
 if(req.nextUrl.searchParams.get('mode')==='nba-period-source'){
  if(sport!=='nba')return NextResponse.json({error:'Unsupported sport'},{status:400});
  try{return NextResponse.json(await getOwlsNbaPeriodSourceCoverage(),{headers:{'Cache-Control':'no-store'}})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Source unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
 }
 if(req.nextUrl.searchParams.get('mode')==='feed-sample'){
  const allowed=(row:any,keys:string[])=>Object.fromEntries(keys.filter(k=>['string','number','boolean'].includes(typeof row?.[k])).map(k=>[k,row[k]]));
  try{const p=await getOwlsPayload(sport);return NextResponse.json({sport,games:(p?.data||[]).slice(0,30).map((g:any)=>({
   ...allowed(g,['id','gameId','eventId','homeTeam','awayTeam','home_team','away_team','commenceTime','commence_time','startTime','date']),
   books:(g.books||[]).slice(0,12).map((b:any)=>({...allowed(b,['key','name','lastUpdate']),props:(b.props||[]).filter((p:any)=>p.category==='points').slice(0,2).map((p:any)=>allowed(p,['playerName','player','category','line','overPrice','underPrice','lastUpdate','isMainLine','isAlternate','marketStructure','lineType','suspended']))}))
  })),updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}catch(e:any){return NextResponse.json({error:String(e?.message||'Feed unavailable')},{status:503})}
 }
 if(req.nextUrl.searchParams.get('mode')==='included-results'){
  // Explicit public-field allowlist: never forward arbitrary provider bodies.
  const fields=['eventId','event_id','gameId','game_id','date','startTime','gameTime','player','playerId','playerName','category','propType','book','sportsbook','line','isMain','isMainLine','marketStructure','capturePhase','overPrice','underPrice','updatedAt','lastUpdate','recordedAt','capturedAt','timestamp','actual','status','final','verdict','result','ungradableReason','count','playerCount','entryCount','entries','players','finalEntries'];
  const example=(r:any,depth=0):any=>Object.fromEntries([
   ...fields.filter(k=>['string','number','boolean'].includes(typeof r?.[k])).map(k=>[k,r[k]]),
   ...depth<2?['closing','books','lines','outcomes','results','entries'].filter(k=>r?.[k]&&typeof r[k]==='object').map(k=>[k,{keys:Object.keys(r[k]).slice(0,30),sample:Array.isArray(r[k])?r[k].slice(0,2).map((v:any)=>example(v,depth+1)):example(r[k],depth+1)}]):[],
  ]);
  const describe=(p:any)=>{
   const container=p?.data??p;
   const rows=Array.isArray(container)?container:Array.isArray(container?.games)?container.games:Array.isArray(container?.props)?container.props:Array.isArray(container?.results)?container.results:Array.isArray(container?.entries)?container.entries:[];
   return {keys:Object.keys(p||{}),dataKeys:container&&!Array.isArray(container)?Object.keys(container):null,count:rows.length,examples:rows.slice(0,2).map((r:any)=>example(r)),rowKeys:rows[0]?Object.keys(rows[0]):[]};
  };
  const sample=await getOwlsIncludedResultsSample(sport).then(p=>{
   const history=p.priceHistory?.data,points=Array.isArray(history?.history)?history.history:[];
   return {date:p.date,gameId:p.gameId,discovery:describe(p.discovery),olderDays:p.olderDays,results:describe(p.response),quoteEvidence:inspectOwlsResultEvidence(p.response),
    priceHistory:history?{gameId:history.gameId,player:history.player,category:history.category,book:history.book,points:points.length,opening:example(history.openingLine),examples:[...points.slice(0,2),...points.slice(-2)].map((r:any)=>example(r))}:null,priceHistoryError:p.priceHistory?.error??null};
  },e=>({error:String(e?.message||'Included results unavailable')}));
  return NextResponse.json({sport,sample,scope:'Discovery only; provider verdicts do not validate forecasts or establish frozen quote provenance.',updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }
 const [merged,source]=await Promise.allSettled([getOwlsPayload(sport),getOwlsBet365Payload(sport)]);
 const categories=new Map<string,number>();let games=0;
 const quarterSamples:any[]=[];
 if(merged.status==='fulfilled'&&sport==='nfl')for(const game of merged.value?.data||[])for(const book of game.books||[])for(const prop of book.props||[]){if(/(?:1q|q1|quarter)/i.test(String(prop.category||''))&&quarterSamples.filter(p=>p.category===prop.category).length<2)quarterSamples.push({category:prop.category,period:prop.periodID??prop.periodId??prop.period??null,gameTime:game.commenceTime||game.commence_time||game.startTime||game.date,book:book.key,updated:prop.lastUpdate||book.lastUpdate,line:prop.line??prop.point??prop.total,overPrice:prop.overPrice??prop.over_price,underPrice:prop.underPrice??prop.under_price,marketStructure:prop.marketStructure,lineType:prop.lineType,isMainLine:prop.isMainLine,isAlternate:prop.isAlternate,suspended:prop.suspended,isSuspended:prop.isSuspended,active:prop.active,propId:prop.propId})}
 const qualifyingQuarter=sport==='nfl'&&merged.status==='fulfilled'?Object.fromEntries(['passing_yards','receiving_yards','rushing_yards'].map(base=>['q1_'+base,footballBookRows(merged.value,'q1_'+base,[base+'_1q','q1_'+base]).map(r=>({playerName:r.playerName,gameTime:r.gameTime,book:r.sportsbook,line:r.line}))])):undefined;
 if(merged.status==='fulfilled')for(const game of merged.value?.data||[]){games++;for(const book of game.books||[])for(const prop of book.props||[]){const key=[book.key,prop.category??prop.market??prop.type,prop.periodID??prop.periodId??prop.period??'game'].join('|');categories.set(key,(categories.get(key)||0)+1)}}
 const raw=source.status==='fulfilled'?source.value:null;
 const archive=await getOwlsArchiveCoverage().then(coverage=>({coverage}),e=>({error:String(e?.message||'Archive unavailable')}));
 const validationSample=await getOwlsArchiveValidationSample(sport).then(({query,response:p})=>{
  const rows=Array.isArray(p?.data)?p.data:Array.isArray(p?.data?.props)?p.data.props:Array.isArray(p?.props)?p.props:null;
  return {query,responseKeys:Object.keys(p||{}),dataKeys:p?.data&&!Array.isArray(p.data)?Object.keys(p.data):null,
   rows:rows?.length??null,knownMain:rows?.filter((r:any)=>r.isMain===true).length??null,
   labelledTwoSidedMain:rows?.filter((r:any)=>r.isMain===true&&r.closing?.overPrice!=null&&r.closing?.underPrice!=null).length??null,
   examples:rows?.slice(0,2).map((r:any)=>({keys:Object.keys(r),eventId:r.eventId,gameTime:r.gameTime,playerName:r.playerName,propType:r.propType,book:r.book,isMain:r.isMain,closing:r.closing}))??[],
   scope:'First bounded page only; counts do not establish archive-wide coverage or model validation.'};
 },e=>({error:String(e?.message||'Archive sample unavailable')}));
 const supplement=await getSgoSupplement(sport.toUpperCase());
 const supplementCategories=new Map<string,number>();
 for(const event of supplement?.data||[])for(const odd of Object.values(event.odds||{}) as any[]){const key=[odd.statID,odd.periodID,odd.sideID].join('|');supplementCategories.set(key,(supplementCategories.get(key)||0)+1)}
 const supplementGames=sgoBookGames(supplement);
 const supplementalCoverage={warning:supplement?.warning||null,events:supplement?.data?.length||0,categories:Object.fromEntries(supplementCategories),namedBookQuotes:supplementGames.reduce((n:number,g:any)=>n+g.books.reduce((a:number,b:any)=>a+b.props.length,0),0),qualifyingQuarter:sport==='nfl'?Object.fromEntries(['passing_yards','receiving_yards','rushing_yards'].map(base=>['q1_'+base,footballBookRows({data:supplementGames},'q1_'+base,[base+'_1q','q1_'+base]).map(r=>({playerName:r.playerName,gameTime:r.gameTime,book:r.sportsbook,line:r.line}))])):undefined};
 const buckets=Object.entries(raw?.data||{}).map(([name,v]:[string,any])=>({name,fixtures:(v.fixtures||[]).length,markets:(v.markets||[]).map((m:any)=>({name:m.name,type:m.type,count:(m.outcomes||[]).length,example:(m.outcomes||[]).slice(0,2).map((o:any)=>({name:o.name,handicap:o.handicap,americanOdds:o.americanOdds,status:o.status,fixtureId:o.fixtureId,gameFixtureId:o.gameFixtureId}))}))}));
 return NextResponse.json({sport,merged:{games,error:merged.status==='rejected'?String(merged.reason?.message||'Feed unavailable'):null,categories:Object.fromEntries(categories),quarterSamples,qualifyingQuarter},bet365:{error:source.status==='rejected'?String(source.reason?.message||'Source unavailable'):null,status:raw?.meta?.status,cacheTimestamp:raw?.meta?.cacheTimestamp,buckets},supplement: supplementalCoverage,archive,validationSample,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}
