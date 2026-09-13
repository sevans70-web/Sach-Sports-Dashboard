import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName,safeNumber} from "@/lib/cfb";
import {getEspnCfbSchedule} from "@/lib/cfb-server";

export const dynamic="force-dynamic";
export const revalidate=0;

const OWLS_URL="https://api.owlsinsight.com/api/v1/ncaaf/props";
const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes";

const OWLS_MARKETS:Record<CfbMarketKey,string[]>={
  passing_yards:["passing_yards","passingyards","pass_yards","passyards"],
  pass_completions:["passing_completions","pass_completions","completions","passingcompletions"],
  rushing_yards:["rushing_yards","rushingyards","rush_yards","rushyards"],
  receiving_yards:["receiving_yards","receivingyards","reception_yards","receptionyards"],
  receptions:["receptions","receiving_receptions","receivingreceptions"],
  anytime_td:["anytime_td","anytime_touchdown","anytime_touchdown_scorer","touchdown_scorer"],
  first_td:["first_td","first_touchdown","first_touchdown_scorer","first_scorer"],
};

const HISTORY_KEYS:Partial<Record<CfbMarketKey,string[]>>={
  passing_yards:["passingyards"],
  pass_completions:["completions","passingcompletions"],
  rushing_yards:["rushingyards"],
  receiving_yards:["receivingyards","receptionyards"],
  receptions:["receptions"],
  anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns"],
};

function norm(v:any){return String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");}
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
function gi(prob:number|null,books:number){
  return Math.round(Math.max(1,Math.min(99,(prob??50)*0.82+Math.min(18,books*3)))*10)/10;
}
function easternDayKey(value:Date|string){
  const d=typeof value==="string"?new Date(value):value;
  if(Number.isNaN(d.getTime()))return "";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const get=(t:string)=>parts.find(x=>x.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function rowGameTime(row:any,schedule:any[]){
  if(row.gameTime)return String(row.gameTime);
  const target=cleanName(String(row.matchup||""));
  const g=schedule.find(x=>cleanName(`${x.awayTeam} @ ${x.homeTeam}`)===target);
  return g?.date?String(g.date):"";
}
function categoryMatches(value:any,market:CfbMarketKey){
  const v=norm(value);
  return OWLS_MARKETS[market].some(x=>norm(x)===v);
}

async function espnProfile(name:string,teamName:string){
  try{
    const r=await fetch(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(name)}&limit=12&sport=football`,{cache:"no-store"});
    if(!r.ok)throw new Error("profile");
    const payload=await r.json();
    const nodes:any[]=[];
    const walk=(v:any)=>{
      if(Array.isArray(v))v.forEach(walk);
      else if(v&&typeof v==="object"){nodes.push(v);Object.values(v).forEach(walk);}
    };
    walk(payload);
    const target=cleanName(name);
    const team=cleanName(teamName);
    const matches=nodes.map(n=>{
      const display=String(n.displayName||n.fullName||n.name||n.title||"");
      let score=cleanName(display)===target?100:0;
      const blob=cleanName(JSON.stringify(n));
      if(team&&blob.includes(team))score+=30;
      if(blob.includes("college"))score+=10;
      return {score,n};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    const n=matches[0]?.n||{};
    return {
      id:String(n.id||""),
      headshot:String(n.headshot?.href||n.image?.href||n.image?.url||n.images?.[0]?.href||""),
      teamName:String(n.team?.displayName||n.team?.name||teamName||""),
      teamId:String(n.team?.id||n.teamId||""),
      position:String(n.position?.abbreviation||n.positionAbbreviation||""),
    };
  }catch{
    return {id:"",headshot:"",teamName,teamId:"",position:""};
  }
}

async function fetchOwlsRows(market:CfbMarketKey){
  const apiKey=process.env.OWLS_INSIGHT_API_KEY;
  if(!apiKey)throw new Error("OWLS_INSIGHT_API_KEY is missing from Railway.");

  const r=await fetch(OWLS_URL,{
    headers:{Authorization:`Bearer ${apiKey}`,Accept:"application/json"},
    cache:"no-store",
  });
  if(!r.ok)throw new Error(`Owls Insight returned ${r.status}`);

  const payload=await r.json();
  const games=Array.isArray(payload?.data)?payload.data:[];
  const grouped=new Map<string,any>();

  for(const game of games){
    const away=String(game.awayTeam||game.away_team||"");
    const home=String(game.homeTeam||game.home_team||"");
    const matchup=away&&home?`${away} @ ${home}`:String(game.name||"");
    const gameTime=String(game.commenceTime||game.commence_time||game.startTime||game.date||"");
    const books=Array.isArray(game.books)?game.books:[];

    for(const book of books){
      const bookKey=String(book.key||book.name||book.title||"book");
      const props=Array.isArray(book.props)?book.props:[];
      for(const prop of props){
        if(!categoryMatches(prop.category??prop.market??prop.type,market))continue;
        const playerName=String(prop.playerName||prop.player_name||prop.name||"").trim();
        if(!playerName)continue;

        const teamName=String(prop.team||prop.teamName||prop.team_name||"");
        const line=safeNumber(prop.line??prop.point??prop.total);
        const overPrice=safeNumber(prop.overPrice??prop.over_price??prop.price??prop.odds);
        const underPrice=safeNumber(prop.underPrice??prop.under_price);
        const isTd=market==="anytime_td"||market==="first_td";

        if(!isTd&&line==null)continue;
        if(isTd&&overPrice==null&&line==null)continue;

        const key=`${cleanName(playerName)}|${cleanName(matchup)}`;
        const cur=grouped.get(key)??{
          playerName,teamName,matchup,gameTime,
          lines:[],prices:[],books:new Set<string>(),
        };
        if(line!=null)cur.lines.push(line);
        if(overPrice!=null)cur.prices.push(overPrice);
        cur.books.add(bookKey);
        if(!cur.teamName&&teamName)cur.teamName=teamName;
        grouped.set(key,cur);
      }
    }
  }

  return [...grouped.values()].map((x:any)=>{
    const line=median(x.lines);
    const price=median(x.prices);
    const prob=americanProb(price);
    return {
      playerName:x.playerName,
      teamName:x.teamName,
      matchup:x.matchup,
      gameTime:x.gameTime,
      line,
      price,
      prob,
      bookmakerCount:x.books.size,
    };
  });
}

function cleanKey(v:string){return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
async function fetchGameLog(playerId:string,season:number){
  const r=await fetch(`${ATHLETE_BASE}/${encodeURIComponent(playerId)}/gamelog?season=${season}`,{
    cache:"no-store",
    headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json, text/plain, */*","Origin":"https://www.espn.com","Referer":"https://www.espn.com/"},
  });
  if(!r.ok)throw new Error(`history ${r.status}`);
  return r.json();
}
function valuesFromGameLog(payload:any,market:CfbMarketKey){
  const wanted=HISTORY_KEYS[market]||[];
  if(!wanted.length)return [];
  const names=(payload?.names||[]).map((x:any)=>cleanKey(String(x)));
  let statIndex=-1;
  for(const key of wanted){const i=names.findIndex((n:string)=>n===key);if(i>=0){statIndex=i;break;}}
  if(statIndex<0)return [];
  const values:number[]=[];const seen=new Set<string>();
  for(const seasonType of payload?.seasonTypes||[])for(const category of seasonType?.categories||[]){
    if(category?.type!=="event")continue;
    for(const event of category?.events||[]){
      const id=String(event?.eventId||"");
      if(!id||seen.has(id))continue;
      const value=Number(event?.stats?.[statIndex]);
      if(!Number.isFinite(value))continue;
      seen.add(id);values.push(value);
    }
  }
  return values;
}
function weightedProjection(values:number[]){
  const xs=values.slice(-10);if(!xs.length)return null;
  let weighted=0,total=0;
  xs.forEach((v,i)=>{const w=i+1;weighted+=v*w;total+=w;});
  return Math.round((weighted/total)*10)/10;
}
async function getProjection(playerId:string,market:CfbMarketKey){
  if(!playerId||market==="first_td")return {projection:null,games:0};
  const blocks=await Promise.all([2025,2026].map(async season=>{
    try{return valuesFromGameLog(await fetchGameLog(playerId,season),market);}catch{return [];}
  }));
  const values=blocks.flat().slice(-10);
  return {projection:weightedProjection(values),games:values.length};
}

export async function GET(req:NextRequest){
  const market=(req.nextUrl.searchParams.get("market")||"passing_yards") as CfbMarketKey;
  if(!CFB_MARKETS.some(x=>x[0]===market)){
    return NextResponse.json({success:false,error:"Unsupported CFB market"},{status:400});
  }

  try{
    const [owlsRows,schedule]=await Promise.all([fetchOwlsRows(market),getEspnCfbSchedule()]);
    const today=easternDayKey(new Date());

    const active=owlsRows.filter((row:any)=>{
      const t=rowGameTime(row,schedule);
      if(!t)return true;
      const key=easternDayKey(t);
      return !key||key>=today;
    });

    const rows=await Promise.all(active.slice(0,40).map(async(row:any)=>{
      const profile=await espnProfile(row.playerName,row.teamName);
      const probability=row.prob??50;
      const {projection,games}=await getProjection(profile.id,market);
      return {
        rank:0,
        playerId:profile.id||cleanName(row.playerName),
        playerName:row.playerName,
        teamName:profile.teamName||row.teamName||"CFB",
        teamId:profile.teamId,
        position:profile.position,
        headshot:profile.headshot,
        matchup:row.matchup,
        gameTime:row.gameTime,
        giScore:gi(probability,row.bookmakerCount),
        modelProbability:probability,
        sportsbookLine:row.line,
        sportsbookProbability:row.prob,
        bookmakerCount:row.bookmakerCount,
        perGame:projection,
        modelProjection:projection,
        projectionGames:games,
        seasonTotal:null,
        gamesPlayed:null,
        season:2026,
        summary:`Owls Insight sportsbook-backed ${CFB_MARKETS.find(x=>x[0]===market)?.[2]||market} ranking. ${row.bookmakerCount} book${row.bookmakerCount===1?"":"s"} contributing.`,
        marketBacked:true,
      };
    }));

    rows.sort((a,b)=>b.giScore-a.giScore);
    const ranked=rows.slice(0,25).map((row,index)=>({...row,rank:index+1}));

    return NextResponse.json({
      success:true,
      source:"Owls Insight",
      market,
      rows:ranked,
      sportsbookOnly:true,
      validRankingCount:ranked.length,
      updatedAt:new Date().toISOString(),
    });
  }catch(e){
    return NextResponse.json({
      success:false,
      source:"Owls Insight",
      market,
      rows:[],
      sportsbookOnly:true,
      error:e instanceof Error?e.message:"CFB rankings unavailable",
    },{status:500});
  }
}
