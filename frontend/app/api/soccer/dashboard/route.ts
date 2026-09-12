import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ALLOWED = new Set(["eng.1", "usa.1", "uefa.champions", "esp.1", "ita.1", "ger.1", "fra.1"]);

type Metric = "shots_on_target" | "shots" | "saves" | "goals" | "assists";
const TARGETS: Record<Metric, number> = {
  shots_on_target: 0.5,
  shots: 1.5,
  saves: 2.5,
  goals: 0.5,
  assists: 0.5,
};

function ymd(d: Date){return d.toISOString().slice(0,10).replaceAll("-","")}
function num(v:any){const x=Number(String(v??"").split(":")[0].replace("%",""));return Number.isFinite(x)?x:0}
function keyName(v:any){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/gi,"").toLowerCase()}
function statKey(label:any): Metric | "minutes" | null {
  const x=String(label||"").toLowerCase().replace(/[\s_-]+/g,"");
  const map:Record<string,Metric|"minutes">={min:"minutes",minutes:"minutes",sh:"shots",shots:"shots",totalshots:"shots",sog:"shots_on_target",st:"shots_on_target",shotsontarget:"shots_on_target",g:"goals",gl:"goals",goals:"goals",a:"assists",ast:"assists",assists:"assists",sv:"saves",saves:"saves"};
  return map[x]||null;
}
function poissonOver(lambda:number,line:number){
  const k=Math.floor(line);let cdf=0;
  for(let i=0;i<=k;i++){cdf+=Math.exp(-lambda)*Math.pow(lambda,i)/factorial(i)}
  return Math.max(0,Math.min(100,(1-cdf)*100));
}
function factorial(n:number){let r=1;for(let i=2;i<=n;i++)r*=i;return r}
function expectedMinutes(avg:number,startRate:number){if(startRate>=.8)return Math.min(90,Math.max(avg,78));if(startRate>=.5)return Math.min(90,Math.max(avg,65));return Math.min(90,Math.max(avg,35))}

async function json(url:string){const r=await fetch(url,{headers:{"User-Agent":"SachSportsDashboard/1.0"},next:{revalidate:900}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}

export async function GET(req:NextRequest){
  const league=req.nextUrl.searchParams.get("league")||"eng.1";
  if(!ALLOWED.has(league))return NextResponse.json({success:false,error:"Unsupported league"},{status:400});
  const now=new Date(),start=new Date(now.getTime()-35*86400000),end=new Date(now.getTime()+8*86400000);
  const errors:string[]=[];
  try{
    const board=await json(`${ESPN_BASE}/${league}/scoreboard?dates=${ymd(start)}-${ymd(end)}&limit=500`);
    const games=(board?.events||[]).map((event:any)=>{
      const comp=event?.competitions?.[0]||{},teams=comp?.competitors||[];
      const home=teams.find((x:any)=>x.homeAway==="home")||{},away=teams.find((x:any)=>x.homeAway==="away")||{};
      const type=event?.status?.type||{};
      return {gameId:String(event?.id||""),kickoff:String(event?.date||""),awayTeam:String(away?.team?.displayName||"Away"),homeTeam:String(home?.team?.displayName||"Home"),awayLogo:String(away?.team?.logo||""),homeLogo:String(home?.team?.logo||""),awayScore:away?.score??null,homeScore:home?.score??null,status:String(type?.shortDetail||type?.description||"Scheduled"),state:String(type?.state||""),completed:Boolean(type?.completed)};
    }).sort((a:any,b:any)=>String(a.kickoff).localeCompare(String(b.kickoff)));

    const completed=games.filter((g:any)=>g.completed).slice(-36);
    const summaries=await Promise.all(completed.map(async(g:any)=>{try{return {game:g,data:await json(`${ESPN_BASE}/${league}/summary?event=${g.gameId}`)}}catch(e:any){errors.push(`summary ${g.gameId}: ${e?.message||e}`);return null}}));
    const appearances:any[]=[];
    for(const item of summaries){if(!item)continue;for(const teamBlock of item.data?.boxscore?.players||[]){const team=teamBlock?.team||{},teamName=String(team?.displayName||team?.shortDisplayName||"");for(const group of teamBlock?.statistics||[]){const labels=group?.labels||group?.names||[];for(const ar of group?.athletes||[]){const athlete=ar?.athlete||{},values=ar?.stats||[];const row:any={gameId:item.game.gameId,gameDate:item.game.kickoff,playerId:String(athlete?.id||""),playerName:String(athlete?.displayName||athlete?.shortName||athlete?.fullName||"Unknown"),photoUrl:String(athlete?.headshot?.href||""),team:teamName,position:String(athlete?.position?.abbreviation||"").toUpperCase(),starter:Boolean(ar?.starter),minutes:0,shots:0,shots_on_target:0,goals:0,assists:0,saves:0};let found=false;labels.forEach((label:any,i:number)=>{const k=statKey(label);if(k){row[k]=num(values[i]);found=true}});if(found)appearances.push(row)}}}}
    }

    const upcoming=games.filter((g:any)=>!g.completed);const teamCtx=new Map<string,any>();
    for(const g of upcoming){if(!teamCtx.has(g.homeTeam))teamCtx.set(g.homeTeam,{opponent:g.awayTeam,homeAway:"HOME",matchup:`${g.awayTeam} @ ${g.homeTeam}`,kickoff:g.kickoff});if(!teamCtx.has(g.awayTeam))teamCtx.set(g.awayTeam,{opponent:g.homeTeam,homeAway:"AWAY",matchup:`${g.awayTeam} @ ${g.homeTeam}`,kickoff:g.kickoff})}

    const metrics:Metric[]=["shots_on_target","shots","saves","goals","assists"];const rankings:any={};const allPlayers=new Set<string>();
    for(const metric of metrics){
      const byPlayer=new Map<string,any[]>();for(const r of appearances){if(!teamCtx.has(r.team))continue;if(metric==="saves"&&r.position!=="GK"&&Number(r.saves)<=0)continue;if(metric!=="saves"&&r.position==="GK")continue;const k=keyName(r.playerName);if(!byPlayer.has(k))byPlayer.set(k,[]);byPlayer.get(k)!.push(r)}
      const rows:any[]=[];
      for(const arr of byPlayer.values()){
        arr.sort((a,b)=>String(a.gameDate).localeCompare(String(b.gameDate)));const recent=arr.slice(-5),last=recent[recent.length-1];if(!last)continue;const gamesN=recent.length,avg=recent.reduce((s,r)=>s+Number(r[metric]||0),0)/gamesN,avgMin=recent.reduce((s,r)=>s+Number(r.minutes||0),0)/gamesN,starts=recent.filter(r=>r.starter).length,startRate=starts/gamesN,per90=avg*90/Math.max(avgMin,20),expMin=expectedMinutes(avgMin,startRate),projection=Math.max(0,.58*avg+.42*per90*(expMin/90)),target=TARGETS[metric],prob=poissonOver(Math.max(projection,.001),target),sampleScore=Math.min(gamesN/5,1)*10,minutesScore=Math.min(avgMin/90,1)*10,startScore=Math.min(startRate,1)*8,gi=Math.max(0,Math.min(100,prob*.72+sampleScore+minutesScore+startScore)),ctx=teamCtx.get(last.team);
        if(metric!=="saves"&&avg===0&&projection<.10)continue;if(metric==="saves"&&avg===0)continue;
        allPlayers.add(last.playerId||last.playerName);rows.push({playerId:last.playerId,playerName:last.playerName,photoUrl:last.photoUrl,team:last.team,position:last.position,matchup:ctx?.matchup||"",opponent:ctx?.opponent||"",homeAway:ctx?.homeAway||"",kickoff:ctx?.kickoff||"",games:gamesN,avgMetric:Number(avg.toFixed(2)),lastMetric:Number(last[metric]||0),avgMinutes:Number(avgMin.toFixed(1)),expectedMinutes:Number(expMin.toFixed(1)),startRate:Number(startRate.toFixed(2)),projection:Number(projection.toFixed(2)),modelTarget:target,modelProbability:Number(prob.toFixed(1)),giScore:Number(gi.toFixed(1)),availability:startRate>=.8?"Likely starter":startRate>=.5?"Expected contributor":"Rotation watch",why:`Last ${gamesN}: ${avg.toFixed(2)}/match · ${avgMin.toFixed(0)} avg min · ${(startRate*100).toFixed(0)}% starts`});
      }
      rankings[metric]=rows.sort((a,b)=>b.giScore-a.giScore||b.modelProbability-a.modelProbability||b.projection-a.projection).slice(0,25).map((r,i)=>({...r,rank:i+1}));
    }
    return NextResponse.json({success:true,league,leagueSlug:league,updatedAt:new Date().toISOString(),games,rankings,playersTracked:allPlayers.size,errors});
  }catch(e:any){return NextResponse.json({success:false,league,leagueSlug:league,updatedAt:new Date().toISOString(),games:[],rankings:{shots_on_target:[],shots:[],saves:[],goals:[],assists:[]},playersTracked:0,errors:[String(e?.message||e)]},{status:200})}
}
