import {type CfbMarketKey, cleanName, safeNumber} from "@/lib/cfb";

const OWLS_URL="https://api.owlsinsight.com/api/v1/ncaaf/props";

const MARKET_ALIASES:Record<CfbMarketKey,string[]>={
  passing_yards:["passing_yards","passingyards","pass_yards","passyards","player_pass_yds"],
  pass_completions:["passing_completions","pass_completions","completions","passingcompletions","player_pass_completions"],
  rushing_yards:["rushing_yards","rushingyards","rush_yards","rushyards","player_rush_yds"],
  receiving_yards:["receiving_yards","receivingyards","reception_yards","receptionyards","player_reception_yds"],
  receptions:["receptions","receiving_receptions","receivingreceptions","player_receptions"],
  anytime_td:["anytime_td","anytime_touchdown","anytime_touchdown_scorer","touchdown_scorer","touchdowns","player_anytime_td"],
  first_td:["first_td","first_touchdown","first_touchdown_scorer","first_scorer","player_1st_td"],
};

function norm(v:any){return String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function marketMatch(v:any,m:CfbMarketKey){const x=norm(v);return Boolean(x)&&MARKET_ALIASES[m].some(a=>norm(a)===x)}
function median(xs:number[]){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2}
function americanProb(v:any){const n=Number(v);if(!Number.isFinite(n)||n===0)return null;return Math.round((n>0?100/(n+100):Math.abs(n)/(Math.abs(n)+100))*1000)/10}
function first(...values:any[]){for(const v of values)if(v!==undefined&&v!==null&&String(v).trim()!=="")return v;return ""}
function pickPlayer(o:any){return String(first(o.playerName,o.player_name,o.statEntityName,o.statEntity?.name,o.player?.name,o.player?.displayName,o.participantName,o.participant?.name,o.entityName,o.athleteName,o.athlete?.displayName,o.description)).trim()}
function pickLine(o:any){return safeNumber(first(o.line,o.point,o.total,o.bookOverUnder,o.overUnder,o.bookLine,o.consensusLine,o.value))}
function pickPrice(o:any){return safeNumber(first(o.overPrice,o.over_price,o.price,o.odds,o.bookOdds,o.americanOdds,o.fairOdds))}
type Ctx={away:string;home:string;matchup:string;gameTime:string;teamName:string;book:string;eventId:string};
function nextContext(o:any,ctx:Ctx):Ctx{
  const away=String(first(o.awayTeam,o.away_team,o.teams?.away?.name,o.away?.name,ctx.away)).trim();
  const home=String(first(o.homeTeam,o.home_team,o.teams?.home?.name,o.home?.name,ctx.home)).trim();
  const matchup=away&&home?`${away} @ ${home}`:String(first(o.matchup,o.eventName,o.name,ctx.matchup)).trim();
  return {away,home,matchup,
    gameTime:String(first(o.commenceTime,o.commence_time,o.startTime,o.start_time,o.gameTime,o.date,ctx.gameTime)).trim(),
    teamName:String(first(o.team,o.teamName,o.team_name,o.player?.team?.name,o.statEntity?.team?.name,ctx.teamName)).trim(),
    book:String(first(o.book?.key,o.book?.name,o.bookmaker?.key,o.bookmaker?.name,o.sportsbook?.key,o.sportsbook?.name,o.bookKey,o.book_key,ctx.book)).trim(),
    eventId:String(first(o.eventID,o.eventId,o.event_id,o.gameId,o.id,ctx.eventId)).trim()};
}
function candidateMarket(o:any,m:CfbMarketKey){return [o.category,o.market,o.marketKey,o.market_key,o.type,o.stat,o.statName,o.stat_name,o.statID,o.statId,o.betType,o.betTypeID,o.betTypeId,o.label,o.name].some(v=>marketMatch(v,m))}

export type CfbOwlsRow={eventId:string;matchup:string;gameTime:string;playerName:string;teamName:string;line:number|null;price:number|null;prob:number|null;bookmakerCount:number};

export async function getOwlsCfbRows(market:CfbMarketKey):Promise<CfbOwlsRow[]>{
  const key=process.env.OWLS_INSIGHT_API_KEY;if(!key)throw new Error("OWLS_INSIGHT_API_KEY is missing from Railway.");
  const r=await fetch(OWLS_URL,{headers:{Authorization:`Bearer ${key}`,"x-api-key":key,Accept:"application/json"},cache:"no-store"});
  if(!r.ok)throw new Error(`Owls Insight returned ${r.status}`);
  const payload=await r.json(),raw:any[]=[],seen=new Set<any>();
  const walk=(v:any,ctx:Ctx)=>{
    if(Array.isArray(v)){for(const x of v)walk(x,ctx);return}
    if(!v||typeof v!=="object"||seen.has(v))return;seen.add(v);const c=nextContext(v,ctx);
    if(candidateMarket(v,market)){
      const playerName=pickPlayer(v),td=market==="anytime_td"||market==="first_td",line=pickLine(v),price=pickPrice(v),side=norm(first(v.side,v.sideID,v.sideId,v.outcome));
      if(playerName&&!["under","no"].includes(side)&&((td&&(price!=null||line!=null))||(!td&&line!=null)))raw.push({...c,playerName,line,price,prob:americanProb(price),book:c.book||"book"});
    }
    for(const x of Object.values(v))walk(x,c);
  };
  walk(payload,{away:"",home:"",matchup:"",gameTime:"",teamName:"",book:"",eventId:""});
  const grouped=new Map<string,any[]>();
  for(const row of raw){const k=`${cleanName(row.playerName)}|${cleanName(row.matchup)}|${market}`;grouped.set(k,[...(grouped.get(k)||[]),row])}
  return [...grouped.values()].map(g=>({eventId:g.find(x=>x.eventId)?.eventId||"",matchup:g.find(x=>x.matchup)?.matchup||"",gameTime:g.find(x=>x.gameTime)?.gameTime||"",playerName:g[0].playerName,teamName:g.find(x=>x.teamName)?.teamName||"",line:median(g.map(x=>x.line).filter((x:any)=>x!=null)),price:median(g.map(x=>x.price).filter((x:any)=>x!=null)),prob:median(g.map(x=>x.prob).filter((x:any)=>x!=null)),bookmakerCount:Math.max(new Set(g.map(x=>x.book).filter(Boolean)).size,1)}));
}

export async function getOwlsQualifiedGames(markets:CfbMarketKey[]){
  const all=await Promise.all(markets.map(async market=>{try{return [market,await getOwlsCfbRows(market)] as const}catch{return [market,[]] as const}}));
  const out=new Map<string,{matchup:string;gameTime:string;eventId:string;props:CfbMarketKey[]}>();
  for(const [market,rows] of all)for(const row of rows){
    if(!row.matchup)continue;const k=cleanName(row.matchup);
    const cur=out.get(k)||{matchup:row.matchup,gameTime:row.gameTime,eventId:row.eventId,props:[]};
    if(!cur.gameTime&&row.gameTime)cur.gameTime=row.gameTime;if(!cur.eventId&&row.eventId)cur.eventId=row.eventId;if(!cur.props.includes(market))cur.props.push(market);out.set(k,cur);
  }
  return [...out.values()];
}
