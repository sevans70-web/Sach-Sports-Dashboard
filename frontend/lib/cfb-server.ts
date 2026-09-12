import { CFB_MARKETS, type CfbMarketKey, type CfbRankingRow, type CfbRosterPlayer, cleanName, safeNumber } from "@/lib/cfb";

const ESPN_SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const ESPN_STATISTICS="https://site.api.espn.com/apis/site/v2/sports/football/college-football/statistics";
const ESPN_SUMMARY="https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";
const ESPN_TEAM="https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams";
const ESPN_ATHLETE="https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";
const ODDS_BASE="https://api.the-odds-api.com/v4";
const ODDS_SPORT="americanfootball_ncaaf";

const ODDS_MARKETS:Record<CfbMarketKey,string>={
  passing_yards:"player_pass_yds",
  pass_completions:"player_pass_completions",
  rushing_yards:"player_rush_yds",
  receiving_yards:"player_reception_yds",
  receptions:"player_receptions",
  anytime_td:"player_anytime_td",
  first_td:"player_1st_td",
};

const SGO_STATS:Record<CfbMarketKey,string[]>={
  passing_yards:["passing_yards","passingYards","passing yards","pass_yards","passYards","player_pass_yds"],
  pass_completions:["completions","passing_completions","passingCompletions","passing completions","pass_completions","player_pass_completions"],
  rushing_yards:["rushing_yards","rushingYards","rushing yards","rush_yards","rushYards","player_rush_yds"],
  receiving_yards:["receiving_yards","receivingYards","receiving yards","reception_yards","receptionYards","player_reception_yds"],
  receptions:["receptions","receiving_receptions","receivingReceptions","player_receptions"],
  anytime_td:["touchdowns","anytimeTouchdown","anytime_touchdown","anytime td","anytime_td","player_anytime_td"],
  first_td:["firstTouchdown","first_touchdown","first td","first_td","player_1st_td"],
};

function normSgo(v:any){
  return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
}
const SGO_NORMALIZED:Record<CfbMarketKey,Set<string>>=Object.fromEntries(
  Object.entries(SGO_STATS).map(([k,v])=>[k,new Set((v as string[]).map(normSgo))])
) as Record<CfbMarketKey,Set<string>>;
function sgoMatchesMarket(o:any,market:CfbMarketKey){
  const values=[o.statID,o.statId,o.stat,o.marketID,o.marketId,o.market,o.betTypeID,o.betTypeId,o.betType,o.statName,o.marketName,o.label,o.name];
  return values.some(v=>v&&SGO_NORMALIZED[market].has(normSgo(v)));
}
function sgoPlayerName(o:any){
  return String(o.statEntityName||o.statEntity?.name||o.playerName||o.player?.name||o.participantName||o.participant?.name||o.entityName||"").trim();
}
function sgoLine(o:any){
  return safeNumber(o.bookOverUnder??o.overUnder??o.line??o.point??o.bookLine??o.consensusLine);
}
function sgoPrice(o:any){
  return safeNumber(o.fairOdds??o.bookOdds??o.odds??o.price??o.americanOdds);
}
function sgoBookCount(o:any){
  const raw=o.byBookmaker||o.bookmakers||o.books||o.sportsbooks;
  if(Array.isArray(raw))return raw.length;
  if(raw&&typeof raw==="object")return Object.keys(raw).length;
  return sgoLine(o)!=null||sgoPrice(o)!=null?1:0;
}

const LEADER_ALIASES:Record<CfbMarketKey,string[]>={
  passing_yards:["passingyards","passing yards"],
  pass_completions:["completions","passingcompletions","passing completions"],
  rushing_yards:["rushingyards","rushing yards"],
  receiving_yards:["receivingyards","receiving yards"],
  receptions:["receptions"],
  anytime_td:["totaltouchdowns","touchdowns","rushingtouchdowns","receivingtouchdowns"],
  first_td:["totaltouchdowns","touchdowns","rushingtouchdowns","receivingtouchdowns"],
};

async function json(url:string,init?:RequestInit){
  const r=await fetch(url,{...init,cache:"no-store"});
  if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function dateKey(d:Date){
  return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;
}

export async function getEspnCfbSchedule(){
  const now=new Date();
  const dates=[-1,0,1,2,3].map(offset=>dateKey(new Date(now.getTime()+offset*86400000)));
  const payloads=await Promise.all(
    dates.map(async date=>{
      try{return await json(`${ESPN_SCOREBOARD}?limit=200&groups=80&dates=${date}`)}
      catch{return {events:[]}}
    })
  );
  const seen=new Set<string>();
  const out:any[]=[];
  for(const payload of payloads){
    for(const e of payload.events||[]){
      const id=String(e.id||"");
      if(!id||seen.has(id))continue;
      seen.add(id);
      const c=e.competitions?.[0]||{};
      const h=(c.competitors||[]).find((x:any)=>x.homeAway==="home")||{};
      const a=(c.competitors||[]).find((x:any)=>x.homeAway==="away")||{};
      const status=e.status?.type||{};
      const state=String(status.state||"pre");
      out.push({
        id,
        date:e.date,
        awayTeamId:String(a.team?.id||""),
        homeTeamId:String(h.team?.id||""),
        awayTeam:a.team?.displayName||"Away",
        homeTeam:h.team?.displayName||"Home",
        awayLogo:a.team?.logo||"",
        homeLogo:h.team?.logo||"",
        awayScore:state==="pre"?null:(a.score??null),
        homeScore:state==="pre"?null:(h.score??null),
        awayRecord:a.records?.[0]?.summary||"",
        homeRecord:h.records?.[0]?.summary||"",
        status:status.shortDetail||status.description||"Scheduled",
        state,
        completed:Boolean(status.completed),
        venue:c.venue?.fullName||"",
        broadcasts:(c.broadcasts||[]).flatMap((b:any)=>b.names||[]),
      });
    }
  }
  return out.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
}

function americanProb(v:any){
  const n=Number(v);
  if(!Number.isFinite(n)||n===0)return null;
  return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10;
}
function median(xs:number[]){
  if(!xs.length)return null;
  const a=[...xs].sort((x,y)=>x-y);
  const i=Math.floor(a.length/2);
  return a.length%2?a[i]:(a[i-1]+a[i])/2;
}
function sgoOdds(e:any){
  const raw=e.odds||e.markets||[];
  if(Array.isArray(raw))return raw;
  if(raw&&typeof raw==="object"){
    return Object.entries(raw).flatMap(([k,v]:any)=>Array.isArray(v)?v:(v&&typeof v==="object"?[{oddID:k,...v}]:[]));
  }
  return [];
}
function sgoMatchup(e:any){
  const t=e.teams||{};
  const away=e.awayTeamName||e.awayTeam||t.away?.name;
  const home=e.homeTeamName||e.homeTeam||t.home?.name;
  return away&&home?`${away} @ ${home}`:String(e.name||e.eventName||"");
}

export async function getCfbMarketRows(market:CfbMarketKey){
  const sgoKey=process.env.SPORTSGAMEODDS_API_KEY||process.env.SPORTS_GAME_ODDS_API_KEY||process.env.SPORTSGAMEODDS_KEY;
  if(sgoKey){
    try{
      const now=new Date(),end=new Date(now.getTime()+10*86400000);
      const qs=new URLSearchParams({
        leagueID:"NCAAF",
        oddsAvailable:"true",
        finalized:"false",
        startsAfter:now.toISOString(),
        startsBefore:end.toISOString(),
        limit:"100",
      });
      const p=await json(`https://api.sportsgameodds.com/v2/events?${qs}`,{headers:{"x-api-key":sgoKey}});
      const rows:any[]=[];
      for(const e of p.data||[]){
        for(const o of sgoOdds(e)){
          if(!sgoMatchesMarket(o,market))continue;
          const side=String(o.sideID||o.sideId||o.side||o.outcome||"").toLowerCase();
          if(!["anytime_td","first_td"].includes(market)&&side&&side!=="over")continue;
          if(["anytime_td","first_td"].includes(market)&&["no","under"].includes(side))continue;
          const playerName=sgoPlayerName(o);
          if(!playerName)continue;
          const line=sgoLine(o);
          const price=sgoPrice(o);
          if(!["anytime_td","first_td"].includes(market)&&line==null)continue;
          if(["anytime_td","first_td"].includes(market)&&price==null&&line==null)continue;
          rows.push({
            eventId:String(e.eventID||e.id||""),
            matchup:sgoMatchup(e),
            playerName,
            line,
            price,
            prob:americanProb(price),
            bookmakerCount:sgoBookCount(o),
          });
        }
      }
      if(rows.length){
        const grouped=new Map<string,any[]>();
        for(const r of rows){
          const k=`${cleanName(r.playerName)}|${cleanName(r.matchup)}`;
          grouped.set(k,[...(grouped.get(k)||[]),r]);
        }
        return [...grouped.values()].map(g=>({
          eventId:g[0].eventId,
          matchup:g[0].matchup,
          playerName:g[0].playerName,
          line:median(g.map(x=>x.line).filter((x:any)=>x!=null)),
          price:median(g.map(x=>x.price).filter((x:any)=>x!=null)),
          prob:median(g.map(x=>x.prob).filter((x:any)=>x!=null)),
          bookmakerCount:Math.max(...g.map(x=>Number(x.bookmakerCount||0)),1),
        }));
      }
    }catch{}
  }

  const key=process.env.THE_ODDS_API_KEY||process.env.ODDS_API_KEY;
  if(!key)return [];
  try{
    const events=await json(`${ODDS_BASE}/sports/${ODDS_SPORT}/events?apiKey=${encodeURIComponent(key)}&dateFormat=iso`);
    const rows:any[]=[];
    for(const e of (events||[]).slice(0,80)){
      let p:any;
      try{
        p=await json(`${ODDS_BASE}/sports/${ODDS_SPORT}/events/${e.id}/odds?apiKey=${encodeURIComponent(key)}&regions=us&markets=${ODDS_MARKETS[market]}&oddsFormat=american&dateFormat=iso`);
      }catch{continue}
      for(const b of p.bookmakers||[]){
        for(const m of b.markets||[]){
          if(m.key!==ODDS_MARKETS[market])continue;
          for(const o of m.outcomes||[]){
            const name=String(o.name||"").toLowerCase();
            if(!["anytime_td","first_td"].includes(market)&&name!=="over")continue;
            if(["anytime_td","first_td"].includes(market)&&["no","under"].includes(name))continue;
            const playerName=String(o.description||(["anytime_td","first_td"].includes(market)?o.name:"")).trim();
            if(!playerName)continue;
            rows.push({
              eventId:String(e.id),
              matchup:`${e.away_team} @ ${e.home_team}`,
              playerName,
              line:safeNumber(o.point),
              price:safeNumber(o.price),
              prob:americanProb(o.price),
              book:b.key,
            });
          }
        }
      }
    }
    const grouped=new Map<string,any[]>();
    for(const r of rows){
      const k=`${cleanName(r.playerName)}|${cleanName(r.matchup)}`;
      grouped.set(k,[...(grouped.get(k)||[]),r]);
    }
    return [...grouped.values()].map(g=>({
      eventId:g[0].eventId,
      matchup:g[0].matchup,
      playerName:g[0].playerName,
      line:median(g.map(x=>x.line).filter((x:any)=>x!=null)),
      price:median(g.map(x=>x.price).filter((x:any)=>x!=null)),
      prob:median(g.map(x=>x.prob).filter((x:any)=>x!=null)),
      bookmakerCount:new Set(g.map(x=>x.book)).size,
    }));
  }catch{
    return [];
  }
}

async function espnProfile(name:string){
  try{
    const p=await json(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=12&sport=football`);
    const nodes:any[]=[];
    const walk=(v:any)=>{
      if(Array.isArray(v))v.forEach(walk);
      else if(v&&typeof v==="object"){nodes.push(v);Object.values(v).forEach(walk)}
    };
    walk(p);
    const target=cleanName(name);
    const matches=nodes.map(n=>{
      const display=String(n.displayName||n.fullName||n.name||n.title||"");
      const id=n.id;
      let score=display&&cleanName(display)===target?100:0;
      if(JSON.stringify(n).toLowerCase().includes("college"))score+=20;
      if(JSON.stringify(n).toLowerCase().includes("football"))score+=10;
      return {score,n,id};
    }).filter(x=>x.id&&x.score>0).sort((a,b)=>b.score-a.score);
    const n=matches[0]?.n||{};
    const img=n.headshot?.href||n.image?.href||n.image?.url||n.images?.[0]?.href||"";
    const team=n.team?.displayName||n.team?.name||n.teamName||"";
    const teamId=String(n.team?.id||n.teamId||"");
    return {
      id:String(matches[0]?.id||""),
      headshot:String(img||""),
      teamName:String(team||""),
      teamId,
      position:String(n.position?.abbreviation||n.positionAbbreviation||""),
    };
  }catch{
    return {id:"",headshot:"",teamName:"",teamId:"",position:""};
  }
}

function gi(prob:number|null,books:number){
  return Math.round(Math.max(1,Math.min(99,(prob??50)*0.82+Math.min(18,books*3)))*10)/10;
}

function walkNodes(v:any,out:any[]=[]){
  if(Array.isArray(v)){for(const x of v)walkNodes(x,out)}
  else if(v&&typeof v==="object"){out.push(v);for(const x of Object.values(v))walkNodes(x,out)}
  return out;
}

function nodeLabel(n:any){
  return cleanName(String(n.displayName||n.name||n.abbreviation||n.label||n.shortDisplayName||""));
}

function extractLeaderRows(payload:any,market:CfbMarketKey){
  const aliases=LEADER_ALIASES[market].map(cleanName);
  const rows:any[]=[];
  const seen=new Set<string>();
  for(const n of walkNodes(payload)){
    const label=nodeLabel(n);
    if(!aliases.some(a=>label===a||label.includes(a)))continue;
    const leaders=Array.isArray(n.leaders)?n.leaders:[];
    for(const l of leaders){
      const athlete=l.athlete||l.player||{};
      const playerName=String(athlete.displayName||athlete.fullName||l.displayName||l.name||"").trim();
      const value=safeNumber(l.value??l.statValue??l.displayValue);
      if(!playerName||value==null)continue;
      const team=l.team||athlete.team||{};
      const teamName=String(team.displayName||team.name||l.teamName||"");
      const teamId=String(team.id||l.teamId||"");
      const headshot=String(athlete.headshot?.href||athlete.headshot||"");
      const id=String(athlete.id||l.athleteId||"");
      const key=`${cleanName(playerName)}|${market}`;
      if(seen.has(key))continue;
      seen.add(key);
      rows.push({playerName,value,teamName,teamId,headshot,id});
    }
  }
  return rows;
}

async function getLeagueStatFallback(market:CfbMarketKey){
  try{
    const payload=await json(`${ESPN_STATISTICS}?season=2026&seasontype=2&limit=200`);
    return extractLeaderRows(payload,market);
  }catch{
    return [];
  }
}

function findMatchupForTeam(schedule:any[],teamName:string,teamId?:string){
  const byId=schedule.find(g=>teamId&&(g.awayTeamId===teamId||g.homeTeamId===teamId));
  const g=byId||schedule.find(g=>{
    const t=cleanName(teamName);
    return t&&(cleanName(g.awayTeam)===t||cleanName(g.homeTeam)===t);
  });
  return g?{
    matchup:`${g.awayTeam} @ ${g.homeTeam}`,
    gameTime:g.date,
    teamLogo:g.awayTeamId===teamId?g.awayLogo:g.homeTeamId===teamId?g.homeLogo:"",
  }:null;
}

export async function getCfbRankings(market:CfbMarketKey):Promise<CfbRankingRow[]>{
  const marketRows=await getCfbMarketRows(market);
  const out:CfbRankingRow[]=[];
  for(const r of marketRows.slice(0,50)){
    const profile=await espnProfile(r.playerName);
    const p=r.prob??50;
    out.push({
      rank:0,
      playerId:profile.id||cleanName(r.playerName),
      playerName:r.playerName,
      teamName:profile.teamName||r.matchup.split(" @ ")[0]||"CFB",
      teamId:profile.teamId,
      position:profile.position,
      headshot:profile.headshot,
      matchup:r.matchup,
      giScore:gi(p,r.bookmakerCount||0),
      modelProbability:p,
      sportsbookLine:r.line,
      sportsbookProbability:p,
      bookmakerCount:r.bookmakerCount||0,
      perGame:null,
      seasonTotal:null,
      gamesPlayed:null,
      season:2026,
      summary:`Sportsbook-backed ${CFB_MARKETS.find(x=>x[0]===market)?.[2]||market} ranking. ${r.bookmakerCount||0} book${(r.bookmakerCount||0)===1?"":"s"} contributing.`,
      marketBacked:true,
    });
  }

  if(!out.length){
    const [schedule,leaders]=await Promise.all([getEspnCfbSchedule(),getLeagueStatFallback(market)]);
    const scheduledTeams=new Set(schedule.flatMap(g=>[cleanName(g.awayTeam),cleanName(g.homeTeam)]));
    const filtered=leaders
      .filter(r=>!r.teamName||scheduledTeams.has(cleanName(r.teamName)))
      .sort((a,b)=>Number(b.value||0)-Number(a.value||0))
      .slice(0,25);

    for(const r of filtered){
      const profile=(!r.id||!r.teamName)?await espnProfile(r.playerName):{id:r.id,headshot:r.headshot,teamName:r.teamName,teamId:r.teamId,position:""};
      const teamName=profile.teamName||r.teamName||"CFB";
      const teamId=profile.teamId||r.teamId||"";
      const match=findMatchupForTeam(schedule,teamName,teamId);
      const stat=Math.max(0,Number(r.value||0));
      const score=Math.max(45,Math.min(88,55+Math.log10(stat+1)*12));
      out.push({
        rank:0,
        playerId:profile.id||r.id||cleanName(r.playerName),
        playerName:r.playerName,
        teamName,
        teamId,
        position:profile.position||"",
        headshot:profile.headshot||r.headshot,
        teamLogo:match?.teamLogo||"",
        matchup:match?.matchup||"",
        gameTime:match?.gameTime||"",
        giScore:Math.round(score*10)/10,
        modelProbability:50,
        sportsbookLine:null,
        sportsbookProbability:null,
        bookmakerCount:0,
        perGame:null,
        seasonTotal:stat,
        gamesPlayed:null,
        season:2026,
        summary:`Verified ESPN 2026 statistical leader fallback for ${CFB_MARKETS.find(x=>x[0]===market)?.[2]||market}. Sportsbook player-prop lines are not currently available, so no betting line or odds were invented.`,
        marketBacked:false,
      });
    }
  }

  out.sort((a,b)=>b.giScore-a.giScore);
  return out.map((r,i)=>({...r,rank:i+1}));
}

export async function getPropQualifiedGames(){
  const markets:CfbMarketKey[]=CFB_MARKETS.map(x=>x[0]);
  const all=await Promise.all(markets.map(async m=>[m,await getCfbMarketRows(m)] as const));
  const map=new Map<string,{matchup:string;props:CfbMarketKey[]}>();
  for(const [m,rows] of all){
    for(const r of rows){
      const k=cleanName(r.matchup);
      const cur:{matchup:string;props:CfbMarketKey[]}=map.get(k)??{matchup:r.matchup,props:[]};
      if(!cur.props.includes(m))cur.props.push(m);
      map.set(k,cur);
    }
  }
  return [...map.values()];
}

export async function getCfbTeamRoster(teamId:string):Promise<{teamName:string;teamLogo:string;players:CfbRosterPlayer[]}>{
  try{
    const payload=await json(`${ESPN_TEAM}/${encodeURIComponent(teamId)}/roster`);
    const team=payload.team||payload.athletes?.[0]?.team||{};
    const players:CfbRosterPlayer[]=[];
    const seen=new Set<string>();
    const add=(a:any)=>{
      const id=String(a.id||"");
      const name=String(a.fullName||a.displayName||a.name||"").trim();
      if(!id||!name||seen.has(id))return;
      seen.add(id);
      players.push({
        id,
        name,
        position:String(a.position?.abbreviation||a.position?.name||""),
        jersey:String(a.jersey||""),
        headshot:String(a.headshot?.href||a.headshot||""),
        className:String(a.experience?.displayValue||a.class||""),
        height:String(a.displayHeight||""),
        weight:String(a.displayWeight||""),
      });
    };
    const groups=payload.athletes||[];
    for(const group of groups){
      if(Array.isArray(group.items))for(const a of group.items)add(a);
      else add(group);
    }
    const order=(p:CfbRosterPlayer)=>{
      const pos=p.position.toUpperCase();
      if(pos==="QB")return 0;
      if(["RB","FB"].includes(pos))return 1;
      if(["WR","TE"].includes(pos))return 2;
      return 3;
    };
    players.sort((a,b)=>order(a)-order(b)||a.name.localeCompare(b.name));
    return {
      teamName:String(team.displayName||team.name||payload.team?.displayName||"Team Roster"),
      teamLogo:String(team.logo||team.logos?.[0]?.href||""),
      players,
    };
  }catch{
    return {teamName:"Team Roster",teamLogo:"",players:[]};
  }
}

export async function getCfbAthleteDetails(athleteId:string){
  let overview:any={};
  let stats:any={};
  try{overview=await json(`${ESPN_ATHLETE}/${encodeURIComponent(athleteId)}/overview?season=2026&seasontype=2`)}catch{}
  try{stats=await json(`${ESPN_ATHLETE}/${encodeURIComponent(athleteId)}/stats?season=2026&seasontype=2`)}catch{}
  const nodes=walkNodes(overview);
  const athlete=nodes.find(n=>String(n.id||"")===String(athleteId)&&String(n.displayName||n.fullName||""))||{};
  return {
    id:athleteId,
    name:String(athlete.displayName||athlete.fullName||overview.athlete?.displayName||"CFB Player"),
    headshot:String(athlete.headshot?.href||overview.athlete?.headshot?.href||""),
    teamName:String(athlete.team?.displayName||overview.athlete?.team?.displayName||""),
    teamId:String(athlete.team?.id||overview.athlete?.team?.id||""),
    position:String(athlete.position?.abbreviation||overview.athlete?.position?.abbreviation||""),
    stats,
  };
}

export async function getCfbGameIntelligence(gameId:string,availableProps:CfbMarketKey[]=[]){
  let summary:any={};
  try{summary=await json(`${ESPN_SUMMARY}?event=${encodeURIComponent(gameId)}`)}catch{}
  const competition=summary.header?.competitions?.[0]||{};
  const competitors=competition.competitors||[];
  const home=competitors.find((x:any)=>x.homeAway==="home")||{};
  const away=competitors.find((x:any)=>x.homeAway==="away")||{};
  const odds=(summary.pickcenter||[])[0]||{};
  const weather=competition.weather||summary.gameInfo?.weather||{};
  const broadcast=(competition.broadcasts||[]).flatMap((b:any)=>b.names||[]);

  const leaders:any[]=[];
  const candidateMarkets:CfbMarketKey[]=availableProps.length?availableProps:["passing_yards","rushing_yards","receiving_yards"];
  for(const market of candidateMarkets.slice(0,4)){
    try{
      const rows=await getCfbRankings(market);
      const hit=rows.filter(r=>{
        const m=cleanName(r.matchup);
        return m&&(m.includes(cleanName(away.team?.displayName||""))&&m.includes(cleanName(home.team?.displayName||"")));
      }).slice(0,2);
      for(const r of hit)leaders.push({market,player:r});
    }catch{}
  }

  return {
    home:{
      id:String(home.team?.id||""),
      name:String(home.team?.displayName||""),
      record:String(home.records?.[0]?.summary||""),
    },
    away:{
      id:String(away.team?.id||""),
      name:String(away.team?.displayName||""),
      record:String(away.records?.[0]?.summary||""),
    },
    venue:String(competition.venue?.fullName||summary.gameInfo?.venue?.fullName||""),
    weather:String(weather.displayValue||weather.conditionId||""),
    broadcast,
    spread:odds.details||"",
    overUnder:odds.overUnder??null,
    provider:odds.provider?.name||"",
    leaders,
  };
}
