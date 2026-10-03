import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName,safeNumber} from "@/lib/cfb";
import {cfbDay,getCfbPredictions,getCfbPredictionsForDays,saveGradedCfbPredictions,type SavedCfbPrediction} from "@/lib/cfb-history";

export const dynamic="force-dynamic";
export const revalidate=0;

const SUMMARY="https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";
const SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const LABELS:Record<CfbMarketKey,string[]>={
  passing_yards:["passingyards","passing yards","pass yds","yds"],
  pass_completions:["completions","passing completions","cmp"],
  rushing_yards:["rushingyards","rushing yards","rush yds","car-yds"],
  receiving_yards:["receivingyards","receiving yards","rec yds"],
  receptions:["receptions","rec"],
  anytime_td:["totaltouchdowns","touchdowns","td"],
  first_td:["first touchdown","firsttd"]
};

const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");

async function json(url:string,ms=7000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
  try{
    const r=await fetch(url,{cache:"no-store",signal:controller.signal,headers:{Accept:"application/json","User-Agent":"Mozilla/5.0"}});
    return r.ok?await r.json():null;
  }catch{return null}finally{clearTimeout(timer)}
}

async function summary(id:string){
  return json(`${SUMMARY}?event=${encodeURIComponent(id)}`,8000);
}

async function gamesForDay(day:string){
  const payload=await json(`${SCOREBOARD}?dates=${day.replaceAll("-","")}&limit=100`,8000);
  return Array.isArray(payload?.events)?payload.events:[];
}

function eventMatchup(event:any){
  const comp=event?.competitions?.[0];
  const competitors=Array.isArray(comp?.competitors)?comp.competitors:[];
  const away=competitors.find((x:any)=>x?.homeAway==="away");
  const home=competitors.find((x:any)=>x?.homeAway==="home");
  const awayName=away?.team?.displayName||away?.team?.shortDisplayName||away?.team?.name||"";
  const homeName=home?.team?.displayName||home?.team?.shortDisplayName||home?.team?.name||"";
  return cleanName(`${awayName} @ ${homeName}`);
}

function summaryFinal(payload:any){
  const competition=payload?.header?.competitions?.[0];
  const type=competition?.status?.type||competition?.status||{};
  const state=String(type?.state||type?.name||competition?.status?.state||"").toLowerCase();
  return Boolean(type?.completed??competition?.status?.completed)||
    state==="post"||state.includes("final")||state.includes("complete");
}

function statIndex(labels:any[],market:CfbMarketKey){
  const n=labels.map(norm),aliases=LABELS[market].map(norm);
  for(const wanted of aliases){
    const i=n.findIndex((v:string)=>v===wanted);
    if(i>=0)return i;
  }
  for(const wanted of aliases){
    const i=n.findIndex((v:string)=>v&&(v.includes(wanted)||wanted.includes(v)));
    if(i>=0)return i;
  }
  return -1;
}

function actualFromSummary(payload:any,market:CfbMarketKey,playerId:string,playerName:string){
  if(!payload||market==="first_td")return null;
  for(const team of Array.isArray(payload?.boxscore?.players)?payload.boxscore.players:[]){
    for(const group of team?.statistics||[]){
      const ix=statIndex(Array.isArray(group?.labels)?group.labels:[],market);
      if(ix<0)continue;
      for(const row of group?.athletes||[]){
        const athlete=row?.athlete||{};
        const id=String(athlete.id||"");
        const name=cleanName(athlete.displayName||athlete.fullName||"");
        if((playerId&&id===playerId)||name===cleanName(playerName)){
          const v=safeNumber((row?.stats||[])[ix]);
          if(v!=null)return Number(v);
        }
      }
    }
  }
  return null;
}

function firstTdResult(payload:any,playerName:string){
  const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[];
  const td=plays.find((x:any)=>{
    const type=cleanName(String(x?.scoringType?.name||x?.scoringType?.abbreviation||x?.type?.text||""));
    const text=cleanName(String(x?.text||x?.shortText||""));
    return type.includes("touchdown")||type==="td"||text.includes("touchdown");
  });
  if(!td)return 0;
  const text=cleanName(String(td?.text||td?.shortText||""));
  const player=cleanName(playerName);
  const last=player.split(" ").filter(Boolean).pop()||player;
  return text.includes(player)||(last.length>=3&&text.split(" ").includes(last))?1:0;
}

function settle(p:SavedCfbPrediction,actual:number){
  if(p.market==="anytime_td"||p.market==="first_td")return actual>0?"hit":"miss";
  if(p.sportsbookLine==null)return "void";
  if(actual===p.sportsbookLine)return "push";
  const pick=p.pick||(p.modelProjection!=null&&p.modelProjection<p.sportsbookLine?"under":"over");
  return pick==="under"?(actual<p.sportsbookLine?"hit":"miss"):(actual>p.sportsbookLine?"hit":"miss");
}

function daysFor(period:string){
  const n=period==="Today"?1:period==="Yesterday"?1:period==="Week"?7:period==="Month"?31:370;
  const offset=period==="Yesterday"?1:0,days:string[]=[];
  for(let i=offset;i<offset+n;i++){
    const d=new Date(Date.now()-i*86400000);
    days.push(cfbDay(d));
  }
  return days;
}

function windowName(v:string){
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return "Other";
  const h=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",hour:"numeric",hourCycle:"h23"}).format(d));
  return h<14?"12 PM":h<18?"Afternoon":"Evening";
}

export async function GET(req:NextRequest){
  const period=req.nextUrl.searchParams.get("period")||"Today";
  const group=req.nextUrl.searchParams.get("group")||"QB";
  const marketParam=req.nextUrl.searchParams.get("market") as CfbMarketKey|null;
  const windowParam=req.nextUrl.searchParams.get("window");
  const markets=(marketParam?[marketParam]:CFB_MARKETS.map(x=>x[0]))
    .filter(m=>CFB_MARKETS.some(x=>x[0]===m)) as CfbMarketKey[];
  const days=daysFor(period);

  try{
    const batch=await getCfbPredictionsForDays(markets,days);
    const all=[...batch.predictions];
    const byBucket=new Map<string,SavedCfbPrediction[]>();
    const summaryCache=new Map<string,any>();
    const dayEventCache=new Map<string,any[]>();

    for(const p of all){
      const key=`${p.market}|${p.gameDate}`;
      byBucket.set(key,[...(byBucket.get(key)||[]),p]);
    }

    for(const [bucket,predictions] of byBucket){
      const [market,day]=bucket.split("|") as [CfbMarketKey,string];
      let changed=false;

      let dayEvents=dayEventCache.get(day);
      if(!dayEvents){
        dayEvents=await gamesForDay(day);
        dayEventCache.set(day,dayEvents);
      }

      for(const p of predictions){
        if(p.status!=="pending")continue;

        const matchup=cleanName(p.matchup);
        const event=dayEvents.find((e:any)=>
          (p.gameId&&String(e?.id||"")===String(p.gameId))||
          (matchup&&eventMatchup(e)===matchup)
        );

        const gameId=String(p.gameId||event?.id||"");
        if(!gameId)continue;

        let payload=summaryCache.get(gameId);
        if(payload===undefined){
          payload=await summary(gameId);
          summaryCache.set(gameId,payload);
        }
        if(!payload||!summaryFinal(payload))continue;

        const actual=market==="first_td"
          ? firstTdResult(payload,p.playerName)
          : actualFromSummary(payload,market,p.playerId,p.playerName);

        if(actual!=null){
          p.actual=actual;
          p.status=settle(p,actual);
          p.gradedAt=new Date().toISOString();
          changed=true;
        }
      }

      if(changed){
        const db=await getCfbPredictions(market,day);
        const merged=db.predictions.map(old=>predictions.find(p=>p.key===old.key)||old);
        await saveGradedCfbPredictions(market,day,merged,db.id);
      }
    }

    const groupMarkets=group==="QB"
      ? new Set(["passing_yards","pass_completions"])
      : new Set(["rushing_yards","receiving_yards","receptions","anytime_td","first_td"]);

    let scoped=marketParam?all:all.filter(p=>groupMarkets.has(p.market));
    if(windowParam)scoped=scoped.filter(p=>windowName(p.gameTime)===windowParam);

    // Model-only rows with no book line cannot be scored as a betting hit/miss.
    const gradeable=scoped.filter(p=>
      p.market==="anytime_td"||
      p.market==="first_td"||
      p.sportsbookLine!=null
    );
    const settled=gradeable.filter(p=>p.status==="hit"||p.status==="miss");
    const hits=settled.filter(p=>p.status==="hit").length;
    const pending=gradeable.filter(p=>p.status==="pending").length;

    return NextResponse.json({
      success:true,
      connected:batch.connected||gradeable.length>0,
      period,group,market:marketParam,window:windowParam,
      total:gradeable.length,
      hits,
      settled:settled.length,
      pending,
      hitRate:settled.length?Math.round(hits/settled.length*1000)/10:null,
      windows:["12 PM","Afternoon","Evening"],
      predictions:gradeable.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))
    },{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
  }catch(e){
    return NextResponse.json({
      success:false,connected:false,hits:0,settled:0,pending:0,total:0,hitRate:null,predictions:[],
      error:e instanceof Error?e.message:"CFB performance unavailable"
    },{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
