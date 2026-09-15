import {NextRequest,NextResponse} from "next/server";
import {NFL_MARKETS,type NflMarketKey,cleanName} from "@/lib/nfl";
import {getEspnNflSchedule} from "@/lib/nfl-server";
import {nflDay,getNflPredictions,saveGradedNflPredictions,type SavedNflPrediction} from "@/lib/nfl-history";

export const dynamic="force-dynamic"; export const revalidate=0;
const ATHLETE_BASE="https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes";
const ESPN_SUMMARY="https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";
const KEYS:Partial<Record<NflMarketKey,string[]>>={
 passing_yards:["passingyards","passyards","yds"],passing_tds:["passingtouchdowns","passingtds","passtds","td"],
 qb_rushing_yards:["rushingyards","rushyards","yds"],rushing_yards:["rushingyards","rushyards","yds"],rushing_tds:["rushingtouchdowns","rushingtds","rushtds","td"],
 receiving_yards:["receivingyards","receptionyards","recyards","yds"],receptions:["receptions","rec"],
 passing_rushing_yards:["passingyards","passyards","yds"],rushing_receiving_yards:["rushingyards","rushyards","yds"],anytime_td:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"],
 q1_touchdowns:["totaltouchdowns","touchdowns","rushingreceivingtouchdowns","td"]
};
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
async function log(id:string,season:number){const r=await fetch(`${ATHLETE_BASE}/${encodeURIComponent(id)}/gamelog?season=${season}`,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json, text/plain, */*"}});return r.ok?r.json():null}
function actualFrom(payload:any,m:NflMarketKey,day:string){
 if(!payload||m==="first_td")return null;
 const names=(Array.isArray(payload.names)?payload.names:[]).map(norm);let ix=-1;
 for(const k of KEYS[m]||[]){ix=names.findIndex((n:string)=>n===k);if(ix>=0)break} if(ix<0)return null;
 const events=payload.events||{};
 for(const st of payload.seasonTypes||[])for(const c of st.categories||[])if(c?.type==="event")for(const ev of c.events||[]){
   const id=String(ev?.eventId||""); const meta=events[id]||{};
   const date=meta?.gameDate||meta?.date||meta?.startDate||ev?.gameDate||ev?.date||"";
   if(date&&nflDay(date)!==day)continue;
   const v=Number(Array.isArray(ev.stats)?ev.stats[ix]:NaN);if(Number.isFinite(v))return v;
 }
 return null;
}
function settle(p:SavedNflPrediction,actual:number){
 if(p.market==="anytime_td"||p.market==="first_td")return actual>0?"hit":"miss";
 if(p.sportsbookLine==null)return "void";
 if(actual>p.sportsbookLine)return "hit"; if(actual<p.sportsbookLine)return "miss"; return "push";
}
function numStat(v:any){const n=Number(String(v??"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:null}
function statFromSummary(payload:any,playerId:string,playerName:string,category:string,label:string){
 const wantedId=String(playerId||""),wantedName=cleanName(playerName),wantedCategory=cleanName(category),wantedLabel=cleanName(label);
 for(const team of payload?.boxscore?.players||[])for(const group of team?.statistics||[]){
   const groupName=cleanName(group?.name||group?.displayName||group?.shortDisplayName||group?.type||"");
   if(!(groupName===wantedCategory||groupName.includes(wantedCategory)||wantedCategory.includes(groupName)))continue;
   const rawLabels=Array.isArray(group?.labels)?group.labels:Array.isArray(group?.keys)?group.keys:[];
   const labels=rawLabels.map((x:any)=>cleanName(typeof x==="string"?x:(x?.name||x?.displayName||x?.abbreviation||x?.label||"")));
   let ix=labels.findIndex((x:string)=>x===wantedLabel);
   if(ix<0&&wantedLabel==="yds")ix=labels.findIndex((x:string)=>x==="yards"||x.endsWith("yards")||x==="yds");
   if(ix<0&&wantedLabel==="rec")ix=labels.findIndex((x:string)=>x==="receptions"||x==="rec");
   if(ix<0&&wantedLabel==="td")ix=labels.findIndex((x:string)=>x==="touchdowns"||x==="td");
   if(ix<0)continue;
   for(const row of group?.athletes||[]){
     const athlete=row?.athlete||row?.player||{};
     const id=String(athlete?.id||row?.athleteId||row?.playerId||"");
     const name=cleanName(athlete?.displayName||athlete?.fullName||athlete?.name||row?.displayName||row?.name||"");
     const sameId=Boolean(wantedId&&id&&id===wantedId);
     const sameName=Boolean(wantedName&&name&&(name===wantedName||name.includes(wantedName)||wantedName.includes(name)));
     if(sameId||sameName){const stats=Array.isArray(row?.stats)?row.stats:Array.isArray(row?.values)?row.values:[];const direct=numStat(stats[ix]);if(direct!=null)return direct}
   }
 }
 return null;
}
function quarterOnePlays(payload:any){
 const all:any[]=[];
 if(Array.isArray(payload?.plays))all.push(...payload.plays);
 if(Array.isArray(payload?.drives?.previous))for(const d of payload.drives.previous)if(Array.isArray(d?.plays))all.push(...d.plays);
 if(payload?.drives?.current&&Array.isArray(payload.drives.current.plays))all.push(...payload.drives.current.plays);
 const seen=new Set<string>();
 return all.filter((play:any)=>{const id=String(play?.id||play?.sequenceNumber||`${play?.text||""}|${play?.clock?.displayValue||""}`);if(seen.has(id))return false;seen.add(id);return Number(play?.period?.number??play?.period??play?.quarter??0)===1});
}
function participantMatches(participant:any,playerId:string,playerName:string){
 const athlete=participant?.athlete||participant?.player||participant||{};
 const id=String(athlete?.id||participant?.athleteId||participant?.playerId||"");
 const name=cleanName(athlete?.displayName||athlete?.fullName||athlete?.name||participant?.displayName||participant?.name||"");
 const wanted=cleanName(playerName),last=wanted.split(" ").filter(Boolean).pop()||wanted;
 return Boolean((playerId&&id&&id===String(playerId))||(wanted&&name&&(name===wanted||name.includes(wanted)||wanted.includes(name)))||(last.length>=3&&name.split(" ").includes(last)));
}
function q1StatFromSummary(payload:any,playerId:string,playerName:string,kind:"passing"|"rushing"|"receiving"){
 let total=0,matched=false;
 for(const play of quarterOnePlays(payload)){
   const text=String(play?.text||play?.shortText||play?.description||"");
   const participants=Array.isArray(play?.participants)?play.participants:[];let roleMatch=false;
   for(const participant of participants){
     if(!participantMatches(participant,playerId,playerName))continue;
     const role=cleanName(participant?.type||participant?.role||participant?.statType||participant?.participantType||"");
     if(kind==="passing"&&(role.includes("passer")||role.includes("passing")||role.includes("pass")))roleMatch=true;
     if(kind==="rushing"&&(role.includes("rusher")||role.includes("rushing")||role.includes("rush")))roleMatch=true;
     if(kind==="receiving"&&(role.includes("receiver")||role.includes("receiving")||role.includes("reception")||role.includes("target")))roleMatch=true;
   }
   if(!roleMatch){
     const cleanText=cleanName(text),wanted=cleanName(playerName),last=wanted.split(" ").filter(Boolean).pop()||wanted;
     const hasName=cleanText.includes(wanted)||(last.length>=3&&cleanText.split(" ").includes(last));
     if(hasName){
       if(kind==="passing"&&/\bpass(?:es|ed)?\b/i.test(text))roleMatch=true;
       if(kind==="receiving"&&/\bpass(?:es|ed)?\b.*\bto\b/i.test(text))roleMatch=true;
       if(kind==="rushing"&&!/\bpass(?:es|ed)?\b/i.test(text)&&(/\bfor\s+-?\d+\s+yards?\b/i.test(text)||/\brun\b|\brush\b/i.test(text)))roleMatch=true;
     }
   }
   if(!roleMatch)continue;
   let yards=numStat(play?.statYardage??play?.yards??play?.yardage);
   if(yards==null){const m=text.match(/for\s+(-?\d+)\s+yards?/i);yards=m?Number(m[1]):null}
   if(yards!=null&&Number.isFinite(yards)){total+=yards;matched=true}
 }
 return matched?total:0;
}
function q1IsFinal(payload:any,game:any){
 if(game?.completed||game?.state==="post")return true;
 const status=payload?.header?.competitions?.[0]?.status||payload?.header?.competitions?.[0]?.status?.type||{};
 const period=Number(status?.period??payload?.header?.competitions?.[0]?.status?.period??0);
 return period>=2;
}
function firstTdFromSummary(payload:any,playerName:string){
 const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[];
 const td=plays.find((x:any)=>{const kind=cleanName(x?.scoringType?.name||x?.scoringType?.abbreviation||x?.type?.text||"");const text=cleanName(x?.text||x?.shortText||"");return kind.includes("touchdown")||kind==="td"||text.includes("touchdown")});
 if(!td)return 0;
 const text=cleanName(td?.text||td?.shortText||""),name=cleanName(playerName),last=name.split(" ").filter(Boolean).pop()||name;
 return text.includes(name)||(last.length>=3&&text.split(" ").includes(last))?1:0;
}
function q1TouchdownsFromSummary(payload:any,playerName:string){
 const name=cleanName(playerName),last=name.split(" ").filter(Boolean).pop()||name;let count=0;
 for(const play of quarterOnePlays(payload)){
  const text=String(play?.text||play?.shortText||play?.description||""),clean=cleanName(text);
  const hasName=clean.includes(name)||(last.length>=3&&clean.split(" ").includes(last));
  if(hasName&&/touchdown|\btd\b/i.test(text))count+=1;
 }
 return count;
}
function summaryActual(payload:any,p:SavedNflPrediction){
 const passY=()=>statFromSummary(payload,p.playerId,p.playerName,"passing","YDS");
 const passTd=()=>statFromSummary(payload,p.playerId,p.playerName,"passing","TD");
 const rushY=()=>statFromSummary(payload,p.playerId,p.playerName,"rushing","YDS");
 const recY=()=>statFromSummary(payload,p.playerId,p.playerName,"receiving","YDS");
 const rec=()=>statFromSummary(payload,p.playerId,p.playerName,"receiving","REC");
 const rushTd=()=>statFromSummary(payload,p.playerId,p.playerName,"rushing","TD");
 const recTd=()=>statFromSummary(payload,p.playerId,p.playerName,"receiving","TD");
 if(p.market==="passing_yards")return passY(); if(p.market==="passing_tds")return passTd(); if(p.market==="qb_rushing_yards"||p.market==="rushing_yards")return rushY();
 if(p.market==="rushing_tds")return rushTd(); if(p.market==="receiving_yards")return recY(); if(p.market==="receptions")return rec();
 if(p.market==="passing_rushing_yards"){const a=passY(),b=rushY();return a==null&&b==null?null:(a||0)+(b||0)}
 if(p.market==="rushing_receiving_yards"){const a=rushY(),b=recY();return a==null&&b==null?null:(a||0)+(b||0)}
 if(p.market==="anytime_td"){const a=rushTd(),b=recTd();return a==null&&b==null?null:(a||0)+(b||0)}
 if(p.market==="first_td")return firstTdFromSummary(payload,p.playerName);
 if(p.market==="q1_touchdowns")return q1TouchdownsFromSummary(payload,p.playerName);
 return null;
}
async function getSummary(gameId:string){try{const r=await fetch(`${ESPN_SUMMARY}?event=${encodeURIComponent(gameId)}`,{cache:"no-store",headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json, text/plain, */*"}});return r.ok?await r.json():null}catch{return null}}
function daysFor(period:string){
 const n=period==="Today"?1:period==="Yesterday"?1:period==="Week"?7:period==="Month"?31:370;
 const offset=period==="Yesterday"?1:0,days:string[]=[];
 for(let i=offset;i<offset+n;i++){const d=new Date();d.setDate(d.getDate()-i);days.push(nflDay(d))} return days;
}
export async function GET(req:NextRequest){
 const period=req.nextUrl.searchParams.get("period")||"Today",group=req.nextUrl.searchParams.get("group")||"QB";
 const marketParam=req.nextUrl.searchParams.get("market") as NflMarketKey|null;
 const markets=(marketParam?[marketParam]:NFL_MARKETS.map(x=>x[0])).filter(m=>NFL_MARKETS.some(x=>x[0]===m));
 try{
   const schedule=await getEspnNflSchedule(),days=daysFor(period),all:SavedNflPrediction[]=[];let connected=true,writable=true,recoveredSnapshots=0;
   const summaryCache=new Map<string,any>();
   for(const day of days)for(const market of markets){
     const got=await getNflPredictions(market,day);connected=connected&&got.connected;writable=writable&&(got.writable!==false);recoveredSnapshots+=Number(got.snapshotCount||0);let changed=false;
     for(const p of got.predictions){
       if(p.status!=="pending"){all.push(p);continue}
       const game=(p.gameId?schedule.find((g:any)=>String(g.id||"")===String(p.gameId)):null)||schedule.find((g:any)=>cleanName(`${g.awayTeam} @ ${g.homeTeam}`)===cleanName(p.matchup));
       if(!game){all.push(p);continue}
       const q1=p.market.startsWith("q1_");
       if(!game.completed&&!q1){all.push(p);continue}
       let payload=summaryCache.get(String(game.id||""));
       if(payload===undefined){payload=await getSummary(String(game.id||""));summaryCache.set(String(game.id||""),payload)}
       if(q1&&(!payload||!q1IsFinal(payload,game))){all.push(p);continue}
       let actual=payload?summaryActual(payload,p):null;
       // ESPN's athlete gamelog can lag behind the final whistle. Use it only as a fallback for full-game markets.
       if(actual==null&&!q1&&p.market!=="first_td"){
         const logPayload=await log(p.playerId,Number(p.gameDate.slice(0,4))||2026);
         actual=actualFrom(logPayload,p.market,p.gameDate);
       }
       if(actual!=null){p.actual=actual;p.status=settle(p,actual);p.gradedAt=new Date().toISOString();changed=true}
       all.push(p);
     }
     if(changed)await saveGradedNflPredictions(market,day,got.predictions,got.id);
   }
   const groupMarkets=group==="QB"?new Set<NflMarketKey>(["passing_yards","passing_tds","qb_rushing_yards","passing_rushing_yards"]):group==="Q1"?new Set<NflMarketKey>(["q1_touchdowns"]):new Set<NflMarketKey>(["rushing_yards","rushing_tds","receiving_yards","receptions","rushing_receiving_yards","anytime_td","first_td"]);
   const scoped=marketParam?all:all.filter(p=>groupMarkets.has(p.market));
   const settled=scoped.filter(p=>p.status==="hit"||p.status==="miss"),hits=scoped.filter(p=>p.status==="hit").length,pending=scoped.filter(p=>p.status==="pending").length;
   return NextResponse.json({success:true,connected,writable,period,group,market:marketParam,total:scoped.length,hits,settled:settled.length,pending,
     hitRate:settled.length?Math.round(hits/settled.length*1000)/10:null,recoveredSnapshots,predictions:scoped.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))},{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
 }catch(e){return NextResponse.json({success:false,connected:false,hits:0,settled:0,pending:0,hitRate:null,predictions:[],error:e instanceof Error?e.message:"NFL performance unavailable"},{status:500,headers:{"Cache-Control":"no-store"}})}
}
