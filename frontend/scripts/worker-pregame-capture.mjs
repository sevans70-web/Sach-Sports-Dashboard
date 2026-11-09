import {createHash} from 'node:crypto';

/** Staging-only pregame capture; independent of Railway /data and its scheduler.
 * Each quote is inserted once in Supabase. Subsequent ticks NEVER update
 * the original price, prediction or timestamp, including after kickoff.
 */
export const PREGAME_MARKETS=Object.freeze({
 nba:['points','rebounds','assists','threes_made','steals','blocks','pts_rebs_asts','pts_rebs','pts_asts','rebs_asts','first_basket','q1_points','q1_rebounds','q1_assists','q1_threes_made','q1_pts_rebs_asts'],
 nfl:['passing_yards','passing_tds','rushing_yards','receiving_yards','receptions','anytime_td','first_td','passing_rushing_yards','rushing_receiving_yards','passing_interceptions','sacks','tackles','tackles_assists','q1_passing_yards','q1_rushing_yards','q1_receiving_yards'],
 nhl:['shots_on_goal','points','goals','assists','blocked_shots','goalie_saves'],
 cfb:['passing_yards','pass_completions','rushing_yards','receiving_yards','receptions','anytime_td','first_td','q1_passing_yards','q1_rushing_yards','q1_receiving_yards'],
 cbb:['points','rebounds','assists','threes_made','steals','blocks','pts_rebs_asts','pts_rebs','pts_asts','rebs_asts']
});
export const CAPTURE_MARKETS=Object.freeze(Object.entries(PREGAME_MARKETS).flatMap(([sport,markets])=>markets.map(market=>({sport,market}))));
const numeric=(value)=>typeof value==='number'&&Number.isFinite(value);
const str=(value)=>String(value??'').trim();
const validId=(value)=>/^\d{1,24}$/.test(str(value));
const validPrice=(value)=>numeric(value)&&Math.abs(value)>=100;
export const torontoCaptureDay=value=>{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=name=>parts.find(part=>part.type===name)?.value||'';
 return [get('year'),get('month'),get('day')].join('-');
};

/** Each 5-minute tick checks six different markets. No network calls for
 * inactive/paused sports; every configured market is revisited cyclically.
 * The 58-market cycle has a bounded gap of up to 50 minutes, NOT a guarantee
 * that a quote arriving in the last minute will be captured.
 */
export function marketsForCaptureTick(when=Date.now(),batchSize=6){
 if(!Number.isFinite(when)||!Number.isInteger(batchSize)||batchSize<1||batchSize>CAPTURE_MARKETS.length)throw Error('Invalid capture schedule');
 const tick=Math.floor(when/300_000),start=(tick*batchSize)%CAPTURE_MARKETS.length;
 return Array.from({length:batchSize},(_,i)=>CAPTURE_MARKETS[(start+i)%CAPTURE_MARKETS.length]);
}
export function originalPregameQuote(row,sport,market,now=Date.now()){
 if(!Object.hasOwn(PREGAME_MARKETS,sport)||!PREGAME_MARKETS[sport].includes(market))return null;
 const gameId=str(row?.gameId),playerId=str(row?.playerId);
 if(!validId(gameId)||!validId(playerId)||!str(row?.playerName)||row?.quoteVerified!==true||row?.quoteVersion!==1||row?.marketBacked!==true)return null;
 if(row?.frozen===true||row?.boardFrozen===true||row?.lockedAtKickoff===true||['in','post'].includes(str(row?.gameState).toLowerCase()))return null;
 const start=Date.parse(row?.gameTime||''),updated=Date.parse(row?.quoteUpdatedAt||'');
 if(!Number.isFinite(start)||!Number.isFinite(updated)||start-now<=120_000||start-now>48*3600_000||updated>now+60_000||now-updated>15*60_000||updated>=start)return null;
 const scorer=['scorer','milestone'].includes(str(row?.lineType));
 const line=row?.sportsbookLine;
 if(!str(row?.quoteId)||!str(row?.sportsbookKey)||!validPrice(row?.overPrice))return null;
 if(!scorer&&(!numeric(line)||!validPrice(row?.underPrice)))return null;
 if(scorer&&market!=='first_basket'&&market!=='first_td'&&market!=='anytime_td'&&market!=='q1_anytime_td')return null;
 const allowed=new Set(['OVER','UNDER','YES','FIRST BASKET']);
 const sourceSide=str(row?.prediction).toUpperCase();
 const selection=row?.researchForecast?.modelSelection;
 const selectionTime=Date.parse(selection?.calculatedAt||'');
 const side=selection&&['OVER','UNDER'].includes(selection.side)&&
  selection.line===line&&selection.quoteId===row.quoteId&&
  selection.sportsbookKey===row.sportsbookKey&&
  selection.price===(selection.side==='OVER'?row.overPrice:row.underPrice)&&
  Number.isFinite(selectionTime)&&selectionTime>=updated&&selectionTime<=now&&selectionTime<start
   ?selection.side:null;
 const capturedAt=new Date(now).toISOString(),gameTime=new Date(start).toISOString();
 const payload={
  version:1,sport,market,gameId,playerId,playerName:str(row.playerName),teamName:str(row.teamName),matchup:str(row.matchup),
  gameTime,capturedAt,sourcePrediction:allowed.has(sourceSide)?sourceSide:null,
  fittedModelPick:side,modelProjection:numeric(row?.researchForecast?.projection)?row.researchForecast.projection:null,
  historicalBaseline:numeric(row?.modelProjection)?row.modelProjection:null,
  quote:{quoteId:str(row.quoteId),sportsbook:str(row.sportsbook),sportsbookKey:str(row.sportsbookKey),
   line:scorer?null:line,overPrice:row.overPrice,underPrice:scorer?null:row.underPrice,
   lineType:str(row.lineType),quoteUpdatedAt:new Date(updated).toISOString(),quotePeriod:str(row.quotePeriod),quoteMarket:str(row.quoteMarket)},
  modelValidation:row?.researchForecast?.validatedForBetting===true,
  dataType:'original_pregame_quote_not_graded',
 };
 const checksum=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 return {sport,market,game_id:gameId,player_id:playerId,game_date:torontoCaptureDay(gameTime),
  game_time:gameTime,quote_updated_at:new Date(updated).toISOString(),
  prediction_side:side,source_prediction:payload.sourcePrediction,sportsbook_line:scorer?null:line,
  checksum,payload};
}
const API_ROUTES={nba:'/api/nba/rankings',nfl:'/api/nfl/rankings',nhl:'/api/nhl/rankings',cfb:'/api/cfb/rankings-board',cbb:'/api/cbb/rankings'};
function dbHeaders(env,prefer){
 const key=str(env?.SUPABASE_SECRET_KEY);
 if(!key||!str(env?.SUPABASE_URL))throw Error('Cloudflare history credentials unavailable');
 return {'apikey':key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),Accept:'application/json',
  'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})};
}
async function db(env,path,init={},read=globalThis.fetch){
 const base=str(env.SUPABASE_URL).replace(/\/$/,'');
 const response=await read(base+'/rest/v1/'+path,{...init,headers:{...dbHeaders(env,init.prefer),...(init.headers||{})},cache:'no-store'});
 if(!response.ok)throw Error('Cloudflare pregame storage HTTP '+response.status);
 return response.status===204?null:response.json();
}
export async function captureWorkerPregameMarket(env,dashboard,ctx,sport,market,now=Date.now(),reader=globalThis.fetch){
 const path=API_ROUTES[sport]+'?market='+encodeURIComponent(market);
 const response=await dashboard.fetch(new Request('https://sach-capture.internal'+path,{headers:{Accept:'application/json'}}),env,ctx);
 if(!response.ok)return {sport,market,ok:false,reason:'rankings_http_'+response.status};
 const body=await response.json();
 if(body?.success===false)return {sport,market,ok:false,reason:'rankings_unavailable'};
 const quotes=(Array.isArray(body?.rows)?body.rows:[]).slice(0,75)
  .map(row=>originalPregameQuote(row,sport,market,now)).filter(Boolean);
 if(!quotes.length)return {sport,market,ok:true,eligible:0,stored:0,reason:'no_verified_pregame_quotes'};
 let stored=0;
 for(const day of [...new Set(quotes.map(q=>q.game_date))]){
  const input=quotes.filter(q=>q.game_date===day);
  const params=new URLSearchParams({select:'game_id,player_id,checksum',sport:'eq.'+sport,market:'eq.'+market,game_date:'eq.'+day,limit:'2000'});
  const existing=await db(env,'worker_pregame_originals?'+params.toString(),{},reader);
  const seen=new Set((Array.isArray(existing)?existing:[]).map(r=>r.game_id+'|'+r.player_id));
  const fresh=input.filter(q=>!seen.has(q.game_id+'|'+q.player_id));
  if(!fresh.length)continue;
  await db(env,'worker_pregame_originals?on_conflict=sport,market,game_id,player_id',
   {method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:JSON.stringify(fresh)},reader);
  const verified=await db(env,'worker_pregame_originals?'+params.toString(),{},reader);
  const saved=new Map((Array.isArray(verified)?verified:[]).map(r=>[r.game_id+'|'+r.player_id,r.checksum]));
  for(const item of fresh){
   const checksum=saved.get(item.game_id+'|'+item.player_id);
   if(!checksum)throw Error('Cloudflare pregame capture readback missing');
   // An earlier tick might win the insert race. Never overwrite its original.
   if(checksum===item.checksum)stored++;
  }
 }
 return {sport,market,ok:true,eligible:quotes.length,stored};
}
export async function scheduledPregameCapture(env,dashboard,ctx,time=Date.now()){
 const selected=marketsForCaptureTick(time),results=[];
 // Bounded serial processing prevents a large simultaneous ESPN/OWLS burst.
 for(const {sport,market} of selected)try{
  results.push(await captureWorkerPregameMarket(env,dashboard,ctx,sport,market,Date.now()));
 }catch(error){results.push({sport,market,ok:false,reason:error instanceof Error?error.message.slice(0,110):'capture_failed'});}
 return {time:new Date(time).toISOString(),markets:selected.length,eligible:results.reduce((n,r)=>n+(r.eligible||0),0),
  stored:results.reduce((n,r)=>n+(r.stored||0),0),failed:results.filter(r=>!r.ok).map(r=>({sport:r.sport,market:r.market,reason:r.reason}))};
}
