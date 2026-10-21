import {attachFittedResearchForecasts} from '@/lib/live-model-forecast';
import {frozenNbaSlateBoard,savePregameNbaSlateBoard} from '@/lib/nba-slate-board';
import {mainMarketQuotes} from "@/lib/main-market-quotes";
import {attachBasketballPregameContext} from '@/lib/basketball-pregame-context';
import {archiveResearchBoards} from "@/lib/research-capture";
import {footballQuoteFields} from "@/lib/football-book-quotes";
import {guardRankingPayload} from "@/lib/prop-integrity";
import {getOwlsPayload} from "@/lib/owls-provider";
import {nbaQuoteMatchesGame} from "@/lib/nba-game-match";
import {activeRankingSlate} from "@/lib/active-ranking-slate";
import {providerFetch as fetch} from "@/lib/provider-fetch";
import {nullableNumber} from "@/lib/provider-fetch";
import {
  cleanNbaName,
  loadNbaGameRosters,
  loadNbaOverview,
  playerBaseline,
  type NbaMarketKey,
  NBA_MARKETS,
  nbaHeadshot,
} from "@/lib/nba";
import {getNbaPredictions,saveNbaPredictions} from "@/lib/nba-history";

const OWLS_URL="https://api.owlsinsight.com/api/v1/nba/props";
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const safe=(v:any)=>{return nullableNumber(v)};

function median(xs:number[]){
 const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);
 if(!a.length)return null;
 const i=Math.floor(a.length/2);
 return a.length%2?a[i]:(a[i-1]+a[i])/2;
}

function americanProb(v:any){
 const n=Number(v);
 if(!Number.isFinite(n)||n===0)return null;
 return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10;
}


export function torontoNbaDay(v:Date|string){
 const d=typeof v==="string"?new Date(v):v;
 if(Number.isNaN(d.getTime()))return"";
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(d);
 const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";
 return `${get("year")}-${get("month")}-${get("day")}`;
}

async function fetchOwlsPayload(){
 const [owls,sgo]=await Promise.allSettled([getOwlsPayload("nba"),getSgoSupplement("NBA")]);
 const primary=owls.status==="fulfilled"?owls.value:null,extra=sgo.status==="fulfilled"?sgo.value:null;
 if(!primary&&!extra?.data?.length)throw new Error("NBA odds feeds are unavailable.");
 const primaryWarning=owls.status==='rejected'?String(owls.reason?.message||'Primary NBA feed unavailable'):null;
 return {data:[...(primary?.data||[]),...sgoNbaGames(extra)],feedWarning:[primaryWarning,extra?.warning].filter(Boolean).join('; ')||null};
}

function boardForMarket(payload:any,market:NbaMarketKey){return mainMarketQuotes(payload,market,p=>basketballMarketMatches(p,market))}

/* Only games scheduled for today's Toronto/Eastern calendar date belong in
   today's NBA Top 25. Tomorrow's games remain available in the schedule. */
function rankingSlateGames(overview:any){
 return activeRankingSlate<any>(overview.games||[],torontoNbaDay);
}

type SlateRosterEntry={
 game:any;
 roster:any;
 player:any;
};

type SlateContext={
 games:any[];
 byName:Map<string,SlateRosterEntry[]>;
 entries:SlateRosterEntry[];
};

const g=globalThis as typeof globalThis&{
 __sachNbaSlateContextCache?:Map<string,{at:number;value:SlateContext}>;
 __sachNbaSlateContextInflight?:Map<string,Promise<SlateContext>>;
};

const slateCache=
 g.__sachNbaSlateContextCache||
 (g.__sachNbaSlateContextCache=new Map());

const slateInflight=
 g.__sachNbaSlateContextInflight||
 (g.__sachNbaSlateContextInflight=new Map());

async function loadSlateContext(overview:any):Promise<SlateContext>{
 const games=rankingSlateGames(overview);
 const key=games.map((x:any)=>String(x.gameId||"")).join("|");

 if(!key)return {games:[],byName:new Map(),entries:[]};

 const hit=slateCache.get(key);
 if(hit&&Date.now()-hit.at<5*60*1000)return hit.value;

 const running=slateInflight.get(key);
 if(running)return running;

 const promise=(async()=>{
  const blocks=await Promise.all(
   games.map(async(game:any)=>({
    game,
    rosters:await loadNbaGameRosters(String(game.gameId||"")).catch(()=>[]),
   }))
  );

  const entries:SlateRosterEntry[]=[];
  const byName=new Map<string,SlateRosterEntry[]>();

  for(const block of blocks){
   for(const roster of block.rosters||[]){
    for(const player of roster.players||[]){
     if(player.active===false)continue;

     const entry={game:block.game,roster,player};
     entries.push(entry);

     const key=cleanNbaName(player.playerName);
     const list=byName.get(key)||[];
     list.push(entry);
     byName.set(key,list);
    }
   }
  }

  const value={games,byName,entries};
  slateCache.set(key,{at:Date.now(),value});
  return value;
 })().finally(()=>slateInflight.delete(key));

 slateInflight.set(key,promise);
 return promise;
}

function chooseRosterEntry(entries:SlateRosterEntry[],b:any){
 const matching=entries.filter(entry=>nbaQuoteMatchesGame(b,entry.game));
 return matching.length===1?matching[0]:undefined;
}

function baselineGi(player:any,starter:boolean){
 const reliability=Math.min(
  1,
  Math.max(0,Number(player?.gamesPlayed||0)/82)
 );

 return Math.round(
  Math.min(99.9,58+reliability*22+(starter?8:0))*10
 )/10;
}

async function rowsForMarket(
 payload:any,
 overview:any,
 market:NbaMarketKey
){
 const board=boardForMarket(payload,market);
 const context=await loadSlateContext(overview);

 if(!context.games.length)return [];

 const baselineById=new Map(
  (overview.players||[]).map((p:any)=>[String(p.playerId),p])
 );

 const baselineByName=new Map(
  (overview.players||[]).map(
   (p:any)=>[cleanNbaName(p.playerName),p]
  )
 );

 const uniqueBoard=[
  ...board.filter((b:any)=>chooseRosterEntry(context.byName.get(cleanNbaName(b.playerName))||[],b)).reduce((acc:Map<string,any>,b:any)=>{
   const key=cleanNbaName(b.playerName);
   const existing=acc.get(key);

   if(
    !existing||
    Number(b.bookmakerCount||0)>Number(existing.bookmakerCount||0)
   ){
    acc.set(key,b);
   }

   return acc;
  },new Map<string,any>()).values()
 ] as any[];

 const rows=uniqueBoard.map((b:any)=>{
  const rosterEntries=context.byName.get(
   cleanNbaName(b.playerName)
  )||[];

  const rosterEntry=chooseRosterEntry(rosterEntries,b);

  // Current-roster validation is mandatory. If the player is not actually
  // on a team in the today + next-slate window, do not rank them.
  if(!rosterEntry)return null;

  const {game,roster,player:rosterPlayer}=rosterEntry;

  const rosterTeam=String(
   roster.teamAbbr||""
  ).toUpperCase();

  const propTeam=String(b.playerTeam||"").toUpperCase();

  if(propTeam&&rosterTeam&&propTeam!==rosterTeam)return null;

  const baseline:any=
   baselineById.get(String(rosterPlayer.playerId))||
   baselineByName.get(cleanNbaName(rosterPlayer.playerName));

  const projection=playerBaseline(baseline,market);

  const edge:number|null=
   projection!=null&&b.line!=null
    ?projection-b.line
    :null;

  const reliability=Math.min(
   1,
   Math.max(0,Number(baseline?.gamesPlayed||0)/30)
  );

  const edgePct=
   edge!=null&&b.line
    ?Math.min(1,Math.abs(edge)/Math.max(1,Math.abs(b.line)))
    :0;

  const firstBasket=market==="first_basket";

  const modelProbability=
   firstBasket
    ?b.bookProbability
    :(
      edge==null
       ?null
       :Math.max(
        50,
        Math.min(
         82,
         Math.round(
          (54+Math.abs(edge)*2.2+reliability*5)*10
         )/10
        )
       )
     );

  const gi=Math.round(
   Math.min(
    99.9,
    firstBasket
     ?45+(modelProbability??0)*0.4+reliability*15
     :50+edgePct*35+reliability*15
   )*10
  )/10;

  const teamLogo=
   String(game.awayAbbr||"").toUpperCase()===rosterTeam
    ?game.awayLogo
    :String(game.homeAbbr||"").toUpperCase()===rosterTeam
      ?game.homeLogo
      :roster.teamLogo||"";

  return{
   playerId:rosterPlayer.playerId,
   teamId:roster.teamId,
   playerName:rosterPlayer.playerName,
   teamName:rosterTeam||roster.teamName||"NBA",
   position:rosterPlayer.position||"",
   teamLogo:teamLogo||"",
   matchup:`${game.awayTeam} @ ${game.homeTeam}`,
   gameTime:game.tipoff||b.gameTime,
   gameId:game.gameId||"",
   providerGameTime:b.gameTime,
   providerEventId:b.eventId,
   gameState:game.state||"pre",
   gameStatus:game.status||"Scheduled",
   headshot:rosterPlayer.headshot||nbaHeadshot(rosterPlayer.playerId),
   ...footballQuoteFields(b),sportsbookLine:b.line,
   bookmakerCount:b.bookmakerCount,
   modelProjection:firstBasket?null:projection,
   projectionMethod:market.startsWith("q1_")?"pace_estimate":firstBasket?"market_implied":"season_baseline",
   modelProbability,
   giScore:gi,
   prediction:
    firstBasket
     ?"FIRST BASKET"
     :edge==null
       ?null
       :edge>=0
         ?"OVER"
         :"UNDER",
   marketBacked:true,
   lineupConfirmed:Boolean(rosterPlayer.starter),
   summary:
    firstBasket
     ?`Current-roster First Basket candidate backed by ${b.bookmakerCount} sportsbook source${b.bookmakerCount===1?"":"s"}${modelProbability!=null?` with ${modelProbability.toFixed(1)}% market-implied probability`:""}.`
     :projection==null||edge==null
       ?`Current-roster player with a verified sportsbook line ${b.line}. Historical baseline is still loading.`
       :`Current-roster ${rosterTeam} player · ${market.startsWith("q1_")?"Q1 pace estimate (full-game baseline ÷ 4, not quarter-trained)":"2025–26 baseline"} ${projection.toFixed(1)} vs verified line ${Number(b.line).toFixed(1)} (${edge>=0?"+":""}${edge.toFixed(1)} edge). ${b.bookmakerCount} sportsbook source${b.bookmakerCount===1?"":"s"} represented.`,
  };
 }).filter(Boolean) as any[];

 if(market==="first_basket"){
  return rows
   .sort((a:any,b:any)=>b.giScore-a.giScore)
   .slice(0,25)
   .map((x:any,i:number)=>({...x,rank:i+1}));
 }

 const used=new Set(
  rows.map((x:any)=>String(x.playerId||cleanNbaName(x.playerName)))
 );

 const fillers=context.entries.map((entry)=>{
  const {game,roster,player:rosterPlayer}=entry;

  const id=String(rosterPlayer.playerId||"");
  const dedupe=id||cleanNbaName(rosterPlayer.playerName);

  if(used.has(dedupe))return null;

  const baseline:any=
   baselineById.get(id)||
   baselineByName.get(cleanNbaName(rosterPlayer.playerName));

  if(!baseline)return null;

  const projection=playerBaseline(baseline,market);

  if(
   projection==null||
   Number(baseline?.gamesPlayed||0)<10
  )return null;

  const rosterTeam=String(
   roster.teamAbbr||""
  ).toUpperCase();

  const teamLogo=
   String(game.awayAbbr||"").toUpperCase()===rosterTeam
    ?game.awayLogo
    :String(game.homeAbbr||"").toUpperCase()===rosterTeam
      ?game.homeLogo
      :roster.teamLogo||"";

  return{
   playerId:rosterPlayer.playerId,
   teamId:roster.teamId,
   playerName:rosterPlayer.playerName,
   teamName:rosterTeam||roster.teamName||baseline.team||"NBA",
   position:rosterPlayer.position||"",
   teamLogo:teamLogo||"",
   matchup:`${game.awayTeam} @ ${game.homeTeam}`,
   gameTime:game.tipoff||"",
   gameId:game.gameId||"",
   gameState:game.state||"pre",
   gameStatus:game.status||"Scheduled",
   headshot:rosterPlayer.headshot||nbaHeadshot(rosterPlayer.playerId),
   sportsbookLine:null,
   bookmakerCount:0,
   modelProjection:projection,
   modelProbability:null,
   giScore:baselineGi(baseline,Boolean(rosterPlayer.starter)),
   prediction:null,
   marketBacked:false,
   lineupConfirmed:Boolean(rosterPlayer.starter),
   summary:
    `${rosterTeam||roster.teamName} current-roster player for the today/next NBA slate · `+
    `${market.startsWith("q1_")?"Q1 pace estimate (full-game baseline ÷ 4, not quarter-trained)":"2025–26 baseline"} ${projection.toFixed(1)}. `+
    `No verified sportsbook line is available yet, so this row is model-only and is not saved or graded.`,
  };
 }).filter(Boolean) as any[];

 rows.sort((a:any,b:any)=>b.giScore-a.giScore);

 fillers.sort((a:any,b:any)=>
  Number(b.giScore||0)-Number(a.giScore||0)||
  Number(b.modelProjection||0)-Number(a.modelProjection||0)
 );

 const merged:any[]=[];
 const seen=new Set<string>();

 for(const row of [...rows,...fillers]){
  const key=String(row.playerId||cleanNbaName(row.playerName));
  if(!key||seen.has(key))continue;
  seen.add(key);
  merged.push(row);
  if(merged.length>=25)break;
 }

 return merged.map((x:any,i:number)=>({...x,rank:i+1}));
}

async function buildNbaMarketRankingsRaw(
 market:NbaMarketKey,
 shared?:{payload:any;overview:any}
){
 let fallbackDays=[torontoNbaDay(new Date())];

 try{
  const overview=shared?.overview??await loadNbaOverview();

  const slate=rankingSlateGames(overview);
  const slateDays:string[]=[
   ...new Set<string>(
    slate
     .map((x:any)=>torontoNbaDay(x.tipoff||""))
     .filter(Boolean)
   )
  ];

  if(slateDays.length)fallbackDays=slateDays;

  let payload:any=shared?.payload??{data:[]};
  let owlsOk=Boolean(shared?.payload);

  if(!shared){
   try{
    payload=await fetchOwlsPayload();
    owlsOk=true;
   }catch{
    owlsOk=false;
   }
  }

  const ranked=await rowsForMarket(payload,overview,market);

  if(ranked.length){
   const marketBacked=ranked.filter(
    (x:any)=>verifiedNbaPrediction(x,market)
   );

   const saved=
    marketBacked.length
     ?await saveNbaPredictions(market,marketBacked).catch(()=>false)
     :false;

   return{
    success:true,
    market,
    rows:ranked,
    saved,
    feedWarning:payload?.feedWarning||null,
    verifiedPredictions:marketBacked.length,
    warning:market.startsWith("q1_")?"Q1 projections are pace estimates (full-game baseline ÷ 4), not quarter-trained averages. Only verified Q1 book lines are saved.":market==="first_basket"?"Probabilities are sportsbook-implied, not an independent first-basket model.":undefined,
    updatedAt:new Date().toISOString(),
    source:
     marketBacked.length
      ?"Owls Insight NBA props + current ESPN rosters (today + next slate)"
      :"Current ESPN rosters (today + next slate) + 2025–26 baseline",
   };
  }

  throw new Error(
   owlsOk
    ?`No eligible ${market} rows are available for the today/next NBA slate.`
    :"Owls Insight NBA props are not currently available."
  );
 }catch(e:any){
  const snapshots=await Promise.all(
   fallbackDays.map((day)=>
    getNbaPredictions(market,day)
     .catch(()=>({connected:false,predictions:[]} as any))
   )
  );

  const fallback=snapshots
   .flatMap((x:any)=>x.predictions||[])
   .filter((x:any)=>x.status==="pending")
   .sort((a:any,b:any)=>
    new Date(a.gameTime||0).getTime()-new Date(b.gameTime||0).getTime()||
    Number(a.rank||999)-Number(b.rank||999)
   )
   .slice(0,25)
   .map((x:any,i:number)=>({
    rank:i+1,
    playerId:x.playerId,
    playerName:x.playerName,
    teamName:x.teamName,
    teamLogo:x.teamLogo||"",
    headshot:x.headshot||"",
    matchup:x.matchup,
    gameTime:x.gameTime,
    gameId:x.gameId||"",
    sportsbookLine:x.sportsbookLine,
    modelProjection:x.modelProjection,
    modelProbability:x.modelProbability,
    giScore:Math.min(99.9,Number(x.giScore||0)),
    bookmakerCount:x.bookmakerCount,
    prediction:x.pickSide,
    frozen:true,
    marketBacked:true,
    summary:
     "Last successful NBA ranking snapshot for the current upcoming slate retained while live data refreshes.",
   }));

  return{
   success:fallback.length>0,
   market,
   rows:fallback,
   cached:fallback.length>0,
   source:
    fallback.length
     ?"Saved NBA upcoming-slate ranking snapshot"
     :"Owls Insight",
   error:String(e?.message||e),
   updatedAt:new Date().toISOString(),
  };
 }
}

export async function captureAllNbaMarkets(){
 // A sportsbook outage must not abort the entire capture request before
 // per-market fallbacks and diagnostics can run.
 const [oddsResult,overviewResult]=await Promise.allSettled([
  fetchOwlsPayload(),
  loadNbaOverview()
 ]);
 const providerError=oddsResult.status==="rejected"
  ?String(oddsResult.reason?.message||oddsResult.reason):null;
 const overviewError=overviewResult.status==="rejected"
  ?String(overviewResult.reason?.message||overviewResult.reason):null;
 const payload=oddsResult.status==="fulfilled"?oddsResult.value:null;
 const overview=overviewResult.status==="fulfilled"?overviewResult.value:null;

 const results=await Promise.all(
  NBA_MARKETS.map(async([market])=>{
   try{
    return await buildNbaMarketRankings(
     market,
     payload&&overview?{payload,overview}:undefined
    );
   }catch(e:any){
    return{
     success:false,
     market,
     rows:[],
     saved:false,
     error:String(e?.message||e)
    };
   }
  })
 );

 const research=await archiveResearchBoards("nba",results);
 return{
  ...research,
  warning:"Research snapshots are archived separately; validated betting picks remain withheld.",
  success:research.researchArchived||results.some(
   (x:any)=>x.success&&(x.boardSaved||x.boardFrozen||x.saved!==false)
  ),
  providerError,
  overviewError,
  verifiedPredictions:results.reduce((n,x:any)=>n+(x.saved===true?(x.rows||[]).filter((r:any)=>verifiedNbaPrediction(r,x.market)).length:0),0),
  markets:results.map((x:any)=>({
   market:x.market,
   rows:x.rows?.length||0,
  pregameContextRows:x.pregameContextCount||0,
   saved:x.boardSaved===true||x.boardFrozen===true||x.saved===true,
   boardFrozen:x.boardFrozen===true,
   modelSelections:x.modelSelectionCount||0,
   success:x.success,
   error:x.error||null
  })),
  updatedAt:new Date().toISOString()
 };
}
import {basketballMarketMatches,verifiedNbaPrediction} from "@/lib/basketball-markets";
import {getSgoSupplement,sgoNbaGames} from "@/lib/sgo-supplement";

export async function buildNbaMarketRankings(...args:Parameters<typeof buildNbaMarketRankingsRaw>){
 const overview=args[1]?.overview||await loadNbaOverview();
 const frozen=await frozenNbaSlateBoard(args[0],overview.games||[]);
 if(frozen)return frozen;
 const payload=await attachFittedResearchForecasts(guardRankingPayload(await attachBasketballPregameContext(await buildNbaMarketRankingsRaw(...args),'nba'),'nba'),'nba');
 return savePregameNbaSlateBoard(payload,overview.games||[]);
}
