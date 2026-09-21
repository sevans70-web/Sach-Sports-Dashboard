import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName} from "@/lib/cfb";
import {getEspnCfbSchedule,getCfbMarketRows,getCfbRankings,getCfbTeamRoster} from "@/lib/cfb-server";
import {getOwlsCfbRows} from "@/lib/cfb-owls";
import {cfbPredictionProbability,cfbGiScore} from "@/lib/cfb-prediction";
import {saveCfbPregamePredictions,getCfbResultMap,getCfbPredictions} from "@/lib/cfb-history";

export const dynamic="force-dynamic";
export const revalidate=0;

const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";
const HISTORY_KEYS:Partial<Record<CfbMarketKey,string[]>>={
  passing_yards:["passingyards","passyards","yds"],
  pass_completions:["completions","passingcompletions","cmp"],
  rushing_yards:["rushingyards","rushyards","yds"],
  receiving_yards:["receivingyards","receptionyards","recyards","yds"],
  receptions:["receptions","rec"],
  anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"],
};

type RankingPayload={
  success:boolean;
  source:string;
  market:CfbMarketKey;
  rows:any[];
  sportsbookOnly:boolean;
  validRankingCount:number;
  updatedAt:string;
  cached?:boolean;
  stale?:boolean;
  dropped?:any[];
};

type CacheEntry={at:number;payload:RankingPayload};
type ModelEntry={at:number;projection:number|null;games:number};

const g=globalThis as typeof globalThis&{
  __sachCfbRankingCache?:Map<string,CacheEntry>;
  __sachCfbRankingInflight?:Map<string,Promise<RankingPayload>>;
  __sachCfbModelCache?:Map<string,ModelEntry>;
  __sachCfbRosterCache?:Map<string,{at:number;value:Awaited<ReturnType<typeof getCfbTeamRoster>>}>;
};
const rankingCache=g.__sachCfbRankingCache||(g.__sachCfbRankingCache=new Map());
const inflight=g.__sachCfbRankingInflight||(g.__sachCfbRankingInflight=new Map());
const modelCache=g.__sachCfbModelCache||(g.__sachCfbModelCache=new Map());
const rosterCache=g.__sachCfbRosterCache||(g.__sachCfbRosterCache=new Map());

const FRESH_MS=5*60*1000;
const STALE_MS=30*60*1000;
const MODEL_MS=30*60*1000;
const ROSTER_MS=60*60*1000;

const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
function day(v:Date|string){
  const d=typeof v==="string"?new Date(v):v;
  if(Number.isNaN(d.getTime()))return "";
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const get=(t:string)=>p.find(x=>x.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function rowGameTime(row:any,schedule:any[]){
  if(row.gameTime)return String(row.gameTime);
  const target=cleanName(String(row.matchup||""));
  const game=schedule.find(x=>cleanName(`${x.awayTeam} @ ${x.homeTeam}`)===target);
  return game?.date?String(game.date):"";
}
async function timeout<T>(promise:Promise<T>,ms:number,fallback:T):Promise<T>{
  return Promise.race([promise,new Promise<T>(resolve=>setTimeout(()=>resolve(fallback),ms))]);
}
async function fetchJson(url:string,ms=2500){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);
  try{
    const r=await fetch(url,{cache:"no-store",signal:c.signal,headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json, text/plain, */*"}});
    if(!r.ok)throw new Error(String(r.status));
    return await r.json();
  }finally{clearTimeout(timer)}
}
function history(payload:any,market:CfbMarketKey){
  const names=(Array.isArray(payload?.names)?payload.names:[]).map(norm);let ix=-1;
  for(const wanted of HISTORY_KEYS[market]||[]){ix=names.findIndex((n:string)=>n===wanted);if(ix>=0)break}
  if(ix<0)return [];
  const vals:number[]=[];const seen=new Set<string>();
  for(const st of payload?.seasonTypes||[])for(const c of st?.categories||[])if(c?.type==="event")for(const ev of c?.events||[]){
    const id=String(ev?.eventId||"");if(!id||seen.has(id))continue;
    const v=Number(Array.isArray(ev?.stats)?ev.stats[ix]:NaN);
    if(Number.isFinite(v)){seen.add(id);vals.push(v)}
  }
  return vals;
}
function projection(vals:number[]){
  const xs=vals.slice(-10);if(!xs.length)return null;
  let sum=0,w=0;xs.forEach((v,i)=>{const k=i+1;sum+=v*k;w+=k});
  return Math.round(sum/w*10)/10;
}
async function model(id:string,market:CfbMarketKey){
  if(!id||market==="first_td")return {projection:null,games:0};
  const key=`${id}|${market}`,hit=modelCache.get(key);
  if(hit&&Date.now()-hit.at<MODEL_MS)return {projection:hit.projection,games:hit.games};
  const blocks=await Promise.all([2025,2026].map(async y=>{
    try{return history(await fetchJson(`${ATHLETE_BASE}/${encodeURIComponent(id)}/gamelog?season=${y}`,2500),market)}
    catch{return []}
  }));
  const vals=blocks.flat(),value={projection:projection(vals),games:vals.length};
  modelCache.set(key,{at:Date.now(),...value});
  return value;
}
async function roster(teamId:string){
  const hit=rosterCache.get(teamId);
  if(hit&&Date.now()-hit.at<ROSTER_MS)return hit.value;
  const value=await timeout(getCfbTeamRoster(teamId),3000,{teamName:"",teamLogo:"",players:[]});
  rosterCache.set(teamId,{at:Date.now(),value});
  return value;
}
async function prefetchRosters(rows:any[],schedule:any[]){
  const ids=new Set<string>();
  for(const row of rows){
    const target=cleanName(String(row.matchup||""));
    const game=schedule.find((g:any)=>cleanName(`${g.awayTeam} @ ${g.homeTeam}`)===target);
    if(game?.awayTeamId)ids.add(String(game.awayTeamId));
    if(game?.homeTeamId)ids.add(String(game.homeTeamId));
  }
  await Promise.all([...ids].map(id=>roster(id)));
}
function playerFromRosters(row:any,schedule:any[]){
  const wanted=cleanName(row.playerName),target=cleanName(String(row.matchup||""));
  const game=schedule.find((g:any)=>cleanName(`${g.awayTeam} @ ${g.homeTeam}`)===target);
  const supplied=cleanName(row.teamName||"");
  const ids:string[]=[];
  if(game){
    if(supplied&&cleanName(game.awayTeam)===supplied)ids.push(String(game.awayTeamId||""));
    if(supplied&&cleanName(game.homeTeam)===supplied)ids.push(String(game.homeTeamId||""));
    ids.push(String(game.awayTeamId||""),String(game.homeTeamId||""));
  }
  for(const teamId of [...new Set(ids.filter(Boolean))]){
    const rr=rosterCache.get(teamId)?.value;
    const p=rr?.players.find((x:any)=>cleanName(x.name)===wanted)||rr?.players.find((x:any)=>{const n=cleanName(x.name);return n&&(n.includes(wanted)||wanted.includes(n))});
    if(p)return {id:p.id,headshot:p.headshot,teamName:rr?.teamName||row.teamName||"CFB",teamId,position:p.position,teamLogo:rr?.teamLogo||""};
  }
  return {id:"",headshot:"",teamName:row.teamName||"CFB",teamId:"",position:"",teamLogo:""};
}
async function marketRows(market:CfbMarketKey){
  try{
    const rows=await timeout(getOwlsCfbRows(market),4000,[]);
    if(rows.length)return rows;
  }catch{}

  const sportsbook=await timeout(getCfbMarketRows(market),4000,[]);
  if(sportsbook.length)return sportsbook;

  // Books have not posted player props yet. Build an early candidate pool from
  // verified ESPN scheduled-team statistical leaders. The normal enrichment
  // below resolves the athlete to the roster and calculates Sach's projection
  // from verified game history. No sportsbook line or odds are invented.
  const early=await timeout(getCfbRankings(market),6000,[]);
  return early
    .filter((row:any)=>row.matchup&&row.gameTime)
    .map((row:any)=>({
      eventId:"",
      matchup:row.matchup,
      gameTime:row.gameTime,
      playerName:row.playerName,
      teamName:row.teamName,
      line:null,
      price:null,
      prob:null,
      bookmakerCount:0,
      earlyModel:true,
    }));
}
async function build(market:CfbMarketKey):Promise<RankingPayload>{
  const [raw,schedule]=await Promise.all([marketRows(market),timeout(getEspnCfbSchedule(),4000,[])]);
  const today=day(new Date());
  const active=raw.filter((row:any)=>{const t=rowGameTime(row,schedule);const k=t?day(t):"";return !k||k>=today});

  // Rank the sportsbook pool first. Only the strongest 25 are enriched with
  // ESPN player history, instead of resolving 50-60 players on every request.
  const candidates=active
    .map((row:any)=>({...row,_seed:cfbGiScore(row.prob??50,row.bookmakerCount||0,0)}))
    .sort((a:any,b:any)=>b._seed-a._seed)
    .slice(0,25);

  await prefetchRosters(candidates,schedule);

  const enriched=await Promise.all(candidates.map(async(row:any)=>{
    const profile=playerFromRosters(row,schedule);
    const m=await model(profile.id,market);
    const probability=cfbPredictionProbability(market,m.projection,row.line,row.prob);
    // Before books post a line, confidence comes from verified sample depth only.
    // Keep it below market-backed confidence until real market information arrives.
    const earlyConfidence=row.earlyModel&&m.projection!=null
      ?Math.round(Math.min(84,58+Math.min(26,m.games*2.6))*10)/10
      :null;
    const rankingProbability=probability??row.prob??earlyConfidence??50;
    return {
      rank:0,playerId:profile.id||cleanName(row.playerName),playerName:row.playerName,
      teamName:profile.teamName||row.teamName||"CFB",teamId:profile.teamId,position:profile.position,
      headshot:profile.headshot,teamLogo:profile.teamLogo,matchup:row.matchup,
      gameTime:rowGameTime(row,schedule)||row.gameTime,
      giScore:cfbGiScore(rankingProbability,row.bookmakerCount||0,m.games),
      modelProbability:probability??earlyConfidence??rankingProbability,sportsbookLine:row.line,
      sportsbookProbability:row.prob,bookmakerCount:row.bookmakerCount||0,
      perGame:m.projection,modelProjection:m.projection,projectionGames:m.games,
      seasonTotal:null,gamesPlayed:m.games,season:2026,
      summary:row.earlyModel
        ?`Early Sach projection using ${m.games} verified historical game${m.games===1?"":"s"}. Sportsbook player props have not posted yet; no line or odds were invented.`
        :`Sportsbook-backed ${CFB_MARKETS.find(x=>x[0]===market)?.[2]||market} prediction using ${m.games} verified historical game${m.games===1?"":"s"} and ${row.bookmakerCount||0} sportsbook${(row.bookmakerCount||0)===1?"":"s"}.`,
      marketBacked:!row.earlyModel,
    };
  }));

  // Never surface a stat card unless verified history produced a real projection.
  // Impossible negative projections are rejected here at the server boundary.
  const validEnriched=enriched.filter((row:any)=>{
    const value=Number(row.modelProjection);
    return row.modelProjection!=null&&Number.isFinite(value)&&value>=0;
  });
  validEnriched.sort((a,b)=>b.giScore-a.giScore);
  let ranked:any[]=validEnriched.map((r,i)=>({...r,rank:i+1}));

  // Capture the previous visible Top 25 BEFORE kickoff-lock logic uses it.
  const previous=rankingCache.get(market)?.payload?.rows||[];
  const previousRows:any[]=previous;
  const previousByKey=new Map<string,any>(
    previousRows.map((r:any)=>[`${r.playerId}|${r.matchup}`,r])
  );

  // Freeze pregame predictions once the game starts.
  const saved=await timeout(getCfbPredictions(market,today),700,{connected:false,predictions:[]} as any);
  // HARD LOCK: once a player's game starts, that player owns a Top-25 slot
  // until the slate refreshes. Live sportsbook updates cannot remove or replace them.
  const gameForMatchup=(matchup:string)=>schedule.find((g:any)=>
    cleanName(`${g.awayTeam} @ ${g.homeTeam}`)===cleanName(matchup)
  );
  const savedStarted=(saved.predictions||[]).filter((p:any)=>{
    const game=gameForMatchup(p.matchup);
    return game&&game.state!=="pre";
  });

  // Safety lock: if the sportsbook removes the prop at kickoff before storage
  // returns, preserve any player who was visible on the previous Top 25.
  const previousStarted=previousRows.filter((p:any)=>{
    const game=gameForMatchup(p.matchup);
    return game&&game.state!=="pre";
  });

  const lockedMap=new Map<string,any>();
  for(const p of savedStarted){
    const key=`${p.playerId}|${p.matchup}`;
    const prev=previousByKey.get(key) as any;
    lockedMap.set(key,{
      ...(prev||{}),
      rank:p.rank??prev?.rank??99,
      playerId:p.playerId,playerName:p.playerName,teamName:p.teamName,
      position:p.position||prev?.position||"",matchup:p.matchup,gameTime:p.gameTime,
      sportsbookLine:p.sportsbookLine,modelProjection:p.modelProjection,
      modelProbability:p.modelProbability,giScore:p.giScore,
      bookmakerCount:p.bookmakerCount||prev?.bookmakerCount||0,
      perGame:p.modelProjection,marketBacked:true,frozen:true,lockedAtKickoff:true,
      summary:"Top 25 position and pregame prediction locked at kickoff."
    });
  }
  for(const p of previousStarted){
    const key=`${p.playerId}|${p.matchup}`;
    if(!lockedMap.has(key))lockedMap.set(key,{...p,frozen:true,lockedAtKickoff:true});
  }

  // Reserve locked positions FIRST. Only unused Top-25 positions can be filled
  // by refreshed pregame candidates.
  const locked=[...lockedMap.values()]
    .sort((a:any,b:any)=>Number(a.rank||999)-Number(b.rank||999))
    .slice(0,25);
  const lockedKeys=new Set(locked.map((r:any)=>`${r.playerId}|${r.matchup}`));
  const lockedRanks=new Set(locked.map((r:any)=>Number(r.rank)).filter((n:number)=>n>=1&&n<=25));
  const fresh=ranked.filter((r:any)=>!lockedKeys.has(`${r.playerId}|${r.matchup}`));

  const finalRows:any[]=[...locked];
  let freshIndex=0;
  for(let slot=1;slot<=25&&freshIndex<fresh.length;slot++){
    if(lockedRanks.has(slot))continue;
    finalRows.push({...fresh[freshIndex++],rank:slot});
  }
  ranked=finalRows
    .sort((a:any,b:any)=>Number(a.rank||999)-Number(b.rank||999))
    .slice(0,25);

  // Started players remain visible through live/final and cannot be marked dropped.

  const previousRanks=new Map(previous.map((r:any)=>[`${r.playerId}|${r.matchup}`,Number(r.rank)]));
  const currentKeys=new Set(ranked.map((r:any)=>`${r.playerId}|${r.matchup}`));
  const moved=ranked.map((r:any)=>{
    const key=`${r.playerId}|${r.matchup}`,prev=previousRanks.get(key);
    return {...r,movement:prev==null?"NEW":Number(prev)-Number(r.rank)};
  });
  const dropped=previous.filter((r:any)=>{
    if(currentKeys.has(`${r.playerId}|${r.matchup}`))return false;
    const game=gameForMatchup(r.matchup);
    return !game||game.state==="pre";
  }).map((r:any)=>({
    playerId:r.playerId,playerName:r.playerName,teamName:r.teamName,previousRank:r.rank
  }));

  // Prediction Performance depends on this snapshot. Do not fire-and-forget:
  // make the pregame/kickoff snapshot durable before returning rankings.
  await timeout(saveCfbPregamePredictions(market,moved,schedule),6500,false);
  const results=await timeout(getCfbResultMap(market,today),2500,new Map());
  const withResults=moved.map((r:any)=>{
    const p=results.get(`${r.playerId}|${r.matchup}`) as any;
    const margin=p?.actual!=null&&p.sportsbookLine!=null?p.actual-p.sportsbookLine:null;
    return p?{...r,resultStatus:p.status,actualResult:p.actual,resultMargin:margin,resultSymbol:p.status==="hit"?"✅":p.status==="miss"?"❌":p.status==="push"?"➖":p.status==="void"?"VOID":""}:r;
  });

  const hasEarlyModel=withResults.some((row:any)=>!row.marketBacked);
  return {success:true,source:hasEarlyModel?"Sach Model + ESPN":"Owls Insight",market,rows:withResults,dropped,sportsbookOnly:!hasEarlyModel,validRankingCount:withResults.length,updatedAt:new Date().toISOString()};
}
async function getPayload(market:CfbMarketKey){
  const cached=rankingCache.get(market),age=cached?Date.now()-cached.at:Infinity;
  if(cached&&age<FRESH_MS)return {...cached.payload,cached:true};

  const existing=inflight.get(market);
  if(cached&&age<STALE_MS){
    if(!existing){
      const work=build(market).then(payload=>{rankingCache.set(market,{at:Date.now(),payload});return payload}).finally(()=>inflight.delete(market));
      inflight.set(market,work);
    }
    return {...cached.payload,cached:true,stale:true};
  }

  if(existing)return await existing;
  const work=build(market).then(payload=>{rankingCache.set(market,{at:Date.now(),payload});return payload}).finally(()=>inflight.delete(market));
  inflight.set(market,work);
  return await work;
}

export async function GET(req:NextRequest){
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;
  if(!CFB_MARKETS.some(x=>x[0]===market))return NextResponse.json({success:false,error:"Unsupported CFB market"},{status:400});
  try{
    const payload=await timeout(getPayload(market),9000,null as RankingPayload|null);
    const cached=rankingCache.get(market);
    if(payload)return NextResponse.json(payload);
    if(cached)return NextResponse.json({...cached.payload,cached:true,stale:true});
    return NextResponse.json({success:false,source:"Owls Insight",market,rows:[],sportsbookOnly:true,error:"CFB ranking build timed out; retrying from cache."},{status:503});
  }catch(e){
    const cached=rankingCache.get(market);
    if(cached)return NextResponse.json({...cached.payload,cached:true,stale:true});
    return NextResponse.json({success:false,source:"Owls Insight",market,rows:[],sportsbookOnly:true,error:e instanceof Error?e.message:"CFB rankings unavailable"},{status:500});
  }
}
