import type { RankingRow } from "./mlb";

const MLB_API = "https://statsapi.mlb.com/api/v1";
const TORONTO = "America/Toronto";
const SEASON = new Date().getFullYear();

const BATTER_MARKETS = ["home_runs","hits","total_bases","runs","rbis","walks","stolen_bases","hits_runs_rbis","batter_strikeouts"] as const;
const PITCHER_MARKETS = ["strikeouts","outs_recorded","hits_allowed","walks_allowed","earned_runs"] as const;

type GameContext = {
  gamePk:number;
  gameDate:string;
  startTime:string;
  venue:string;
  teamId:number;
  teamName:string;
  opponentId:number;
  opponentName:string;
  probablePitcherId:number|null;
  probablePitcherName:string;
};

type RankingBundle = {
  batter:Record<string,RankingRow[]>;
  pitcher:Record<string,RankingRow[]>;
  batterDropped:Record<string,string[]>;
  pitcherDropped:Record<string,string[]>;
  fetchedAt:string;
  date:string;
  errors:string[];
};

let cache:{day:string;at:number;bundle:RankingBundle}|null=null;
const previousRanks=new Map<string,Map<string,number>>();

function torontoDate(){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:TORONTO,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const v=(t:string)=>p.find(x=>x.type===t)?.value||"";
  return `${v("year")}-${v("month")}-${v("day")}`;
}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v))}
function headshot(id:number){return id?`https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${id}/headshot/67/current`:""}
function per(v:number,d:number,m=1){return d>0?(v/d)*m:0}
function percentile(value:number,pop:number[]){if(!pop.length)return 50;const sorted=[...pop].sort((a,b)=>a-b);let below=0;for(const x of sorted)if(x<=value)below++;return (below/sorted.length)*100}
function probabilityAtLeastOne(ratePerTrial:number,trials:number){const r=clamp(ratePerTrial,0,0.95);return clamp((1-Math.pow(1-r,trials))*100,1,99)}
function teamAbbr(name:string){const map:Record<string,string>={"Arizona Diamondbacks":"ARI","Atlanta Braves":"ATL","Baltimore Orioles":"BAL","Boston Red Sox":"BOS","Chicago Cubs":"CHC","Chicago White Sox":"CWS","Cincinnati Reds":"CIN","Cleveland Guardians":"CLE","Colorado Rockies":"COL","Detroit Tigers":"DET","Houston Astros":"HOU","Kansas City Royals":"KC","Los Angeles Angels":"LAA","Los Angeles Dodgers":"LAD","Miami Marlins":"MIA","Milwaukee Brewers":"MIL","Minnesota Twins":"MIN","New York Mets":"NYM","New York Yankees":"NYY","Athletics":"ATH","Philadelphia Phillies":"PHI","Pittsburgh Pirates":"PIT","San Diego Padres":"SD","San Francisco Giants":"SF","Seattle Mariners":"SEA","St. Louis Cardinals":"STL","Tampa Bay Rays":"TB","Texas Rangers":"TEX","Toronto Blue Jays":"TOR","Washington Nationals":"WSH"};return map[name]||name}

async function json(url:string,revalidate=120){
  const res=await fetch(url,{next:{revalidate}});
  if(!res.ok)throw new Error(`MLB Stats API ${res.status}: ${new URL(url).pathname}`);
  return res.json();
}

async function todayContext(day:string){
  const u=new URL(`${MLB_API}/schedule`);
  u.searchParams.set("sportId","1");u.searchParams.set("date",day);u.searchParams.set("hydrate","team,probablePitcher,venue");
  const payload=await json(u.toString(),30);
  const games:any[]=payload?.dates?.flatMap((d:any)=>d.games||[])||[];
  const byTeam=new Map<number,GameContext>();
  for(const g of games){
    const gameDate=String(g?.gameDate||"");
    const startTime=gameDate?new Intl.DateTimeFormat("en-US",{timeZone:TORONTO,hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(gameDate)):"Time TBA";
    const away=g?.teams?.away?.team||{},home=g?.teams?.home?.team||{};
    const awayP=g?.teams?.away?.probablePitcher||{},homeP=g?.teams?.home?.probablePitcher||{};
    if(away?.id)byTeam.set(Number(away.id),{gamePk:Number(g.gamePk),gameDate,startTime,venue:String(g?.venue?.name||""),teamId:Number(away.id),teamName:String(away.name||""),opponentId:Number(home.id||0),opponentName:String(home.name||""),probablePitcherId:homeP?.id?Number(homeP.id):null,probablePitcherName:String(homeP?.fullName||"Not announced")});
    if(home?.id)byTeam.set(Number(home.id),{gamePk:Number(g.gamePk),gameDate,startTime,venue:String(g?.venue?.name||""),teamId:Number(home.id),teamName:String(home.name||""),opponentId:Number(away.id||0),opponentName:String(away.name||""),probablePitcherId:awayP?.id?Number(awayP.id):null,probablePitcherName:String(awayP?.fullName||"Not announced")});
  }
  return {games,byTeam};
}

function movementFor(market:string, rows:any[], pitcher=false){
  const prev=previousRanks.get(market)||new Map<string,number>();
  const next=new Map<string,number>();
  const enriched=rows.map((r:any,i:number)=>{
    const rank=i+1;const key=String(pitcher?(r.pitcher_id||r.player_id):(r.player_id||r.batter_id));next.set(key,rank);
    const old=prev.get(key);let status="new";let change:number|null=null;
    if(old!=null){change=old-rank;status=change>0?"up":change<0?"down":"same"}
    return {...r,rank,movement:{status,previous:old??null,current:rank,change}};
  });
  previousRanks.set(market,next);
  return enriched;
}

async function batterRankings(context:Map<number,GameContext>){
  const u=new URL(`${MLB_API}/stats`);
  u.searchParams.set("stats","season");u.searchParams.set("group","hitting");u.searchParams.set("season",String(SEASON));u.searchParams.set("sportIds","1");u.searchParams.set("playerPool","ALL");u.searchParams.set("limit","2000");u.searchParams.set("hydrate","person,currentTeam");
  const payload=await json(u.toString(),300);
  const splits:any[]=payload?.stats?.[0]?.splits||[];
  const rows=splits.map((s:any)=>{
    const st=s?.stat||{};const person=s?.player||s?.person||{};const team=s?.team||person?.currentTeam||{};const teamId=Number(team?.id||0);const game=context.get(teamId);
    if(!game)return null;
    const pa=n(st.plateAppearances)||n(st.atBats)+n(st.baseOnBalls);const ab=n(st.atBats);if(pa<25)return null;
    const hits=n(st.hits),hr=n(st.homeRuns),tb=n(st.totalBases),runs=n(st.runs),rbis=n(st.rbi),bb=n(st.baseOnBalls),sb=n(st.stolenBases),so=n(st.strikeOuts);
    const avg=n(st.avg)||per(hits,ab);const slg=n(st.slg)||per(tb,ab);const obp=n(st.obp);
    return {player_id:Number(person?.id||0),player_name:String(person?.fullName||"Player"),headshot_url:headshot(Number(person?.id||0)),team_id:teamId,team_name:game.teamName,team_abbreviation:teamAbbr(game.teamName),opponent_name:game.opponentName,opponent_abbreviation:teamAbbr(game.opponentName),game_pk:game.gamePk,game_time:game.startTime,venue:game.venue,opposing_probable_pitcher:game.probablePitcherName,season_stats:{plate_appearances:pa,at_bats:ab,hits,home_runs:hr,total_bases:tb,runs,rbis,walks:bb,stolen_bases:sb,strikeouts:so,avg,slg,obp,ops:n(st.ops)},_rates:{home_runs:per(hr,pa),hits:per(hits,pa),total_bases:per(tb,pa),runs:per(runs,pa),rbis:per(rbis,pa),walks:per(bb,pa),stolen_bases:per(sb,pa),hits_runs_rbis:per(hits+runs+rbis,pa),batter_strikeouts:per(so,pa)},_avg:avg,_slg:slg,_pa:pa};
  }).filter(Boolean) as any[];

  const markets:Record<string,RankingRow[]>={};const dropped:Record<string,string[]>={};
  for(const market of BATTER_MARKETS){
    const pop=rows.map(r=>n(r._rates[market]));
    const scored=rows.map(r=>{
      const rate=n(r._rates[market]);const rel=clamp(r._pa/350,0.35,1);const pct=percentile(rate,pop);
      // HR needs a broader power signal than season HR/PA alone. Blend HR rate
      // with SLG and OPS so current extra-base/power production can surface
      // hitters outside the same established HR-rate leaders.
      const powerPct=market==="home_runs"
        ? (pct*0.55 + percentile(n(r._slg),rows.map(x=>n(x._slg)))*0.25 + percentile(n(r.season_stats?.ops),rows.map(x=>n(x.season_stats?.ops)))*0.20)
        : pct;
      const gi=50+(powerPct-50)*(0.70+rel*0.30);
      const projection=rate*4.25;
      const extra:any={gi_score:Math.round(gi*10)/10,projection:Math.round(projection*100)/100,reason:`Season production and expected plate appearances rank this matchup in today's MLB player pool.`,summary:`${r.team_abbreviation} vs ${r.opponent_abbreviation} · ${r._pa} PA season sample.`};
      if(market==="home_runs"){
        const raw=probabilityAtLeastOne(rate,4.25);
        const powerLift=(percentile(n(r._slg),rows.map(x=>n(x._slg)))-50)*0.08+(percentile(n(r.season_stats?.ops),rows.map(x=>n(x.season_stats?.ops)))-50)*0.05;
        extra.home_run_probability=Math.round(clamp(raw+powerLift,1,95)*10)/10;
        extra.reason=`HR probability blends season HR rate with overall power production (SLG/OPS), expected plate appearances and today's matchup pool.`;
      }
      if(market==="hits")extra.one_plus_hit_probability=Math.round(probabilityAtLeastOne(r._avg,3.9)*10)/10;
      if(market==="total_bases")extra.projected_total_bases=Math.round(projection*100)/100;
      if(market==="batter_strikeouts")extra.probability=Math.round(probabilityAtLeastOne(rate,4.25)*10)/10;
      return {...r,...extra};
    }).sort((a,b)=>n(b.gi_score)-n(a.gi_score));
    markets[market]=movementFor(`b:${market}`,scored.slice(0,25),false) as RankingRow[];
    if(market==="home_runs") markets.home_runs_pool=scored.slice(25,125).map((r:any,i:number)=>({...r,rank:i+26})) as RankingRow[];
    dropped[market]=scored.slice(25,30).map(r=>r.player_name);
  }
  return {markets,dropped};
}

async function pitcherStats(id:number){
  const u=new URL(`${MLB_API}/people/${id}/stats`);u.searchParams.set("stats","season");u.searchParams.set("group","pitching");u.searchParams.set("season",String(SEASON));
  const p=await json(u.toString(),300);return p?.stats?.[0]?.splits?.[0]?.stat||{};
}

async function pitcherRankings(context:Map<number,GameContext>){
  // A team context stores the opposing starter. Deduplicate those IDs and map the
  // pitcher back to the team he actually plays for by finding the reverse matchup.
  const pitcherIds=[...new Set([...context.values()].map(g=>g.probablePitcherId).filter(Boolean) as number[])];
  const rows:any[]=[];
  await Promise.all(pitcherIds.map(async id=>{try{
    const st=await pitcherStats(id);let own:GameContext|undefined;let pitcherName="";
    for(const g of context.values())if(g.probablePitcherId===id){pitcherName=g.probablePitcherName;own=context.get(g.opponentId);break}
    if(!own)return;
    const starts=n(st.gamesStarted)||n(st.gamesStarted);const outs=n(st.outs);const innings=n(st.inningsPitched);const avgOuts=starts>0?(outs>0?outs/starts:innings*3/starts):15;const avgInn=avgOuts/3;
    const k9=n(st.strikeoutsPer9Inn)||per(n(st.strikeOuts),Math.max(innings,1),9);const h9=n(st.hitsPer9Inn)||per(n(st.hits),Math.max(innings,1),9);const bb9=n(st.walksPer9Inn)||per(n(st.baseOnBalls),Math.max(innings,1),9);const era=n(st.era);
    const proj={strikeouts:k9*avgInn/9,outs_recorded:avgOuts,hits_allowed:h9*avgInn/9,walks_allowed:bb9*avgInn/9,earned_runs:era*avgInn/9};
    rows.push({pitcher_id:id,pitcher_name:pitcherName||`Pitcher ${id}`,player_id:id,player_name:pitcherName||`Pitcher ${id}`,headshot_url:headshot(id),team_id:own.teamId,team_name:own.teamName,team_abbreviation:teamAbbr(own.teamName),opponent_name:own.opponentName,opponent_abbreviation:teamAbbr(own.opponentName),game_pk:own.gamePk,game_time:own.startTime,venue:own.venue,season_stats:st,_proj:proj,_starts:starts,_innings:innings});
  }catch{}}));

  const benchmark:any={strikeouts:4.5,outs_recorded:17.5,hits_allowed:4.5,walks_allowed:1.5,earned_runs:2.5};
  const direction:any={strikeouts:1,outs_recorded:1,hits_allowed:-1,walks_allowed:-1,earned_runs:-1};
  const markets:Record<string,RankingRow[]>={};const dropped:Record<string,string[]>={};
  for(const market of PITCHER_MARKETS){
    const pop=rows.map(r=>direction[market]*n(r._proj[market]));
    const scored=rows.map(r=>{const val=n(r._proj[market]);const pct=percentile(direction[market]*val,pop);const rel=clamp((r._starts||0)/18,0.35,1);const gi=50+(pct-50)*rel;return {...r,projection:Math.round(val*100)/100,gi_score:Math.round(gi*10)/10,benchmark_probability:Math.round(clamp(50+(direction[market]*(val-benchmark[market]))*8,5,95)*10)/10,reason:`Season workload and rate profile produce a ${val.toFixed(1)} projection for today's matchup.`,summary:`${r.team_abbreviation} vs ${r.opponent_abbreviation} · ${r._starts||0} starts.`}}).sort((a,b)=>n(b.gi_score)-n(a.gi_score));
    markets[market]=movementFor(`p:${market}`,scored.slice(0,25),true) as RankingRow[];
    dropped[market]=scored.slice(25,30).map(r=>r.pitcher_name);
  }
  return {markets,dropped};
}

export async function getNextMlbRankings(day=torontoDate()):Promise<RankingBundle>{
  if(cache&&cache.day===day&&Date.now()-cache.at<120_000)return cache.bundle;
  const errors:string[]=[];
  try{
    const {byTeam}=await todayContext(day);
    if(!byTeam.size)throw new Error("No MLB games found for today.");
    const [b,p]=await Promise.all([batterRankings(byTeam),pitcherRankings(byTeam)]);
    const bundle={batter:b.markets,pitcher:p.markets,batterDropped:b.dropped,pitcherDropped:p.dropped,fetchedAt:new Date().toISOString(),date:day,errors};
    cache={day,at:Date.now(),bundle};return bundle;
  }catch(error){
    errors.push(error instanceof Error?error.message:"Unable to build Next.js MLB rankings");
    if(cache?.day===day)return {...cache.bundle,errors:[...cache.bundle.errors,...errors]};
    throw error;
  }
}
