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
const safe=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};

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

function marketMatches(v:any,m:NbaMarketKey){
 const x=norm(v);
 const aliases:Record<NbaMarketKey,string[]>={
  points:["points","playerpoints"],
  rebounds:["rebounds","playerrebounds"],
  assists:["assists","playerassists"],
  threes_made:["threesmade","threepointersmade","3pointersmade"],
  pts_rebs_asts:["ptsrebsasts","pointsreboundsassists","pra"],
  pts_rebs:["ptsrebs","pointsrebounds"],
  pts_asts:["ptsasts","pointsassists"],
  rebs_asts:["rebsasts","reboundsassists"],
  steals:["steals"],
  blocks:["blocks"],
  first_basket:["firstbasket","firstfieldgoal","firstfieldgoalscorer","firstscorer","firstbasketmade"],
 };
 return aliases[m].includes(x);
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
 const key=process.env.OWLS_INSIGHT_API_KEY;
 if(!key)throw new Error("OWLS_INSIGHT_API_KEY is missing from Railway.");

 const r=await fetch(OWLS_URL,{
  headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},
  cache:"no-store"
 });

 if(!r.ok)throw new Error(`Owls Insight returned ${r.status}`);
 return r.json();
}

function boardForMarket(payload:any,market:NbaMarketKey){
 const games=Array.isArray(payload?.data)?payload.data:[];
 const grouped=new Map<string,any>();

 for(const game of games){
  const away=String(game.awayTeam||game.away_team||"");
  const home=String(game.homeTeam||game.home_team||"");
  const matchup=away&&home?`${away} @ ${home}`:String(game.name||"");
  const gameTime=String(
   game.commenceTime||game.commence_time||game.startTime||game.date||""
  );

  for(const book of Array.isArray(game.books)?game.books:[]){
   for(const prop of Array.isArray(book.props)?book.props:[]){
    if(!marketMatches(prop.category??prop.market??prop.type,market))continue;

    const playerName=String(
     prop.playerName||prop.player_name||prop.name||""
    ).trim();
    if(!playerName)continue;

    const playerTeam=String(
      prop.teamAbbr||prop.team_abbr||prop.team||
      prop.playerTeam||prop.player_team||""
    ).toUpperCase();

    const line=safe(prop.line??prop.point??prop.total);
    if(line==null&&market!=="first_basket")continue;

    const over=safe(
      prop.overPrice??prop.over_price??prop.overOdds??prop.over_odds??
      prop.price??prop.odds??prop.americanOdds
    );

    const k=`${cleanNbaName(playerName)}|${cleanNbaName(matchup)}`;
    const cur=grouped.get(k)??{
      playerName,playerTeam,matchup,gameTime,
      lines:[],prices:[],books:new Set<string>()
    };

    if(line!=null)cur.lines.push(line);
    if(over!=null)cur.prices.push(over);
    cur.books.add(String(book.key||book.name||book.title||"book"));
    grouped.set(k,cur);
   }
  }
 }

 return [...grouped.values()].map((x:any)=>({
  playerName:x.playerName,
  playerTeam:x.playerTeam,
  matchup:x.matchup,
  gameTime:x.gameTime,
  line:median(x.lines),
  bookProbability:americanProb(median(x.prices)),
  bookmakerCount:x.books.size,
 }));
}

/*
  Ranking window:
  - any remaining game TODAY, plus
  - the NEXT scheduled NBA date.
  This lets Sunday props appear before Saturday is finished, while preventing
  unrelated league-wide players from filling the board.
*/
function rankingSlateGames(overview:any){
 const games=(overview.games||[])
  .filter((g:any)=>g?.tipoff)
  .sort((a:any,b:any)=>
    new Date(a.tipoff).getTime()-new Date(b.tipoff).getTime()
  );

 const today=torontoNbaDay(new Date());

 const todayGames=games.filter((g:any)=>
  torontoNbaDay(g.tipoff)===today &&
  g.state!=="post"
 );

 const futureAfterToday=games.filter((g:any)=>{
  if(g.state==="post")return false;
  const d=torontoNbaDay(g.tipoff);
  return d>today && new Date(g.tipoff).getTime()>Date.now();
 });

 const nextDay=futureAfterToday.length
  ?torontoNbaDay(futureAfterToday[0].tipoff)
  :"";

 const nextGames=nextDay
  ?futureAfterToday.filter((g:any)=>torontoNbaDay(g.tipoff)===nextDay)
  :[];

 const seen=new Set<string>();
 return [...todayGames,...nextGames].filter((g:any)=>{
  const id=String(g.gameId||"");
  if(!id||seen.has(id))return false;
  seen.add(id);
  return true;
 });
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
 if(!entries.length)return undefined;

 const propDay=torontoNbaDay(b?.gameTime||"");

 if(propDay){
  const same=entries.find(
   (entry)=>torontoNbaDay(entry.game?.tipoff||"")===propDay
  );
  if(same)return same;
 }

 const target=new Date(b?.gameTime||0).getTime();
 if(Number.isFinite(target)&&target>0){
  return [...entries].sort((a,c)=>
   Math.abs(new Date(a.game?.tipoff||0).getTime()-target)-
   Math.abs(new Date(c.game?.tipoff||0).getTime()-target)
  )[0];
 }

 return entries[0];
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
  ...board.reduce((acc:Map<string,any>,b:any)=>{
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
   playerName:rosterPlayer.playerName,
   teamName:rosterTeam||roster.teamName||"NBA",
   position:rosterPlayer.position||"",
   teamLogo:teamLogo||"",
   matchup:`${game.awayTeam} @ ${game.homeTeam}`,
   gameTime:game.tipoff||b.gameTime,
   gameId:game.gameId||"",
   gameState:game.state||"pre",
   gameStatus:game.status||"Scheduled",
   headshot:rosterPlayer.headshot||nbaHeadshot(rosterPlayer.playerId),
   sportsbookLine:b.line,
   bookmakerCount:b.bookmakerCount,
   modelProjection:firstBasket?null:projection,
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
       :`Current-roster ${rosterTeam} player · 2025–26 baseline ${projection.toFixed(1)} vs verified line ${Number(b.line).toFixed(1)} (${edge>=0?"+":""}${edge.toFixed(1)} edge). ${b.bookmakerCount} sportsbook source${b.bookmakerCount===1?"":"s"} represented.`,
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
    `2025–26 baseline ${projection.toFixed(1)}. `+
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

export async function buildNbaMarketRankings(
 market:NbaMarketKey,
 shared?:{payload:any;overview:any}
){
 let fallbackDays=[torontoNbaDay(new Date())];

 try{
  const overview=shared?.overview??await loadNbaOverview();

  const slate=rankingSlateGames(overview);
  const slateDays=[
   ...new Set(
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
    (x:any)=>x.marketBacked&&x.sportsbookLine!=null
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
 const [payload,overview]=await Promise.all([
  fetchOwlsPayload(),
  loadNbaOverview()
 ]);

 const results=await Promise.all(
  NBA_MARKETS.map(async([market])=>{
   try{
    return await buildNbaMarketRankings(
     market,
     {payload,overview}
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

 return{
  success:results.some(
   (x:any)=>x.success&&x.saved!==false
  ),
  markets:results.map((x:any)=>({
   market:x.market,
   rows:x.rows?.length||0,
   saved:x.saved!==false,
   success:x.success,
   error:x.error||null
  })),
  updatedAt:new Date().toISOString()
 };
}
