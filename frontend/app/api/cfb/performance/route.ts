import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS,type CfbMarketKey,cleanName,safeNumber} from "@/lib/cfb";
import {cfbDay,getCfbPredictions,getCfbPredictionsForDays,saveGradedCfbPredictions,type SavedCfbPrediction} from "@/lib/cfb-history";

export const dynamic="force-dynamic";
export const revalidate=0;

const SUMMARY="https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";
const SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

const QB_MARKETS = new Set<CfbMarketKey>([
  "passing_yards",
  "pass_completions",
]);

const OFFENSE_MARKETS = new Set<CfbMarketKey>([
  "rushing_yards",
  "receiving_yards",
  "receptions",
  "anytime_td",
  "first_td",
]);

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
    const r=await fetch(url,{
      cache:"no-store",
      signal:controller.signal,
      headers:{Accept:"application/json","User-Agent":"Mozilla/5.0"}
    });
    return r.ok?await r.json():null;
  }catch{
    return null;
  }finally{
    clearTimeout(timer);
  }
}

async function summary(id:string){
  return json(`${SUMMARY}?event=${encodeURIComponent(id)}`,8000);
}

async function gamesForDay(day:string){
  const payload=await json(
    `${SCOREBOARD}?dates=${day.replaceAll("-","")}&limit=100`,
    8000
  );
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
  const state=String(
    type?.state||
    type?.name||
    competition?.status?.state||
    ""
  ).toLowerCase();

  return Boolean(type?.completed??competition?.status?.completed)||
    state==="post"||
    state.includes("final")||
    state.includes("complete");
}

function statIndex(labels:any[],market:CfbMarketKey){
  const normalized=labels.map(norm);
  const aliases=LABELS[market].map(norm);

  for(const wanted of aliases){
    const index=normalized.findIndex((value:string)=>value===wanted);
    if(index>=0)return index;
  }

  for(const wanted of aliases){
    const index=normalized.findIndex(
      (value:string)=>value&&(value.includes(wanted)||wanted.includes(value))
    );
    if(index>=0)return index;
  }

  return -1;
}

function actualFromSummary(
  payload:any,
  market:CfbMarketKey,
  playerId:string,
  playerName:string
){
  if(!payload||market==="first_td")return null;

  for(const team of Array.isArray(payload?.boxscore?.players)?payload.boxscore.players:[]){
    for(const group of team?.statistics||[]){
      const index=statIndex(
        Array.isArray(group?.labels)?group.labels:[],
        market
      );
      if(index<0)continue;

      for(const row of group?.athletes||[]){
        const athlete=row?.athlete||{};
        const id=String(athlete.id||"");
        const name=cleanName(athlete.displayName||athlete.fullName||"");

        if((playerId&&id===playerId)||name===cleanName(playerName)){
          const value=safeNumber((row?.stats||[])[index]);
          if(value!=null)return Number(value);
        }
      }
    }
  }

  return null;
}

function firstTdResult(payload:any,playerName:string){
  const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[];

  const touchdown=plays.find((play:any)=>{
    const type=cleanName(String(
      play?.scoringType?.name||
      play?.scoringType?.abbreviation||
      play?.type?.text||
      ""
    ));
    const text=cleanName(String(play?.text||play?.shortText||""));

    return type.includes("touchdown")||
      type==="td"||
      text.includes("touchdown");
  });

  if(!touchdown)return 0;

  const text=cleanName(String(touchdown?.text||touchdown?.shortText||""));
  const player=cleanName(playerName);
  const last=player.split(" ").filter(Boolean).pop()||player;

  return text.includes(player)||
    (last.length>=3&&text.split(" ").includes(last))
    ?1
    :0;
}

function settle(prediction:SavedCfbPrediction,actual:number){
  if(prediction.market==="anytime_td"||prediction.market==="first_td"){
    return actual>0?"hit":"miss";
  }

  if(prediction.sportsbookLine==null)return "void";
  if(actual===prediction.sportsbookLine)return "push";

  const pick=
    prediction.pick||
    (
      prediction.modelProjection!=null&&
      prediction.modelProjection<prediction.sportsbookLine
        ?"under"
        :"over"
    );

  return pick==="under"
    ? actual<prediction.sportsbookLine?"hit":"miss"
    : actual>prediction.sportsbookLine?"hit":"miss";
}

function daysFor(period:string){
  const count=
    period==="Today"?1:
    period==="Yesterday"?1:
    period==="Week"?7:
    period==="Month"?31:
    370;

  const offset=period==="Yesterday"?1:0;
  const days:string[]=[];

  for(let i=offset;i<offset+count;i++){
    const date=new Date(Date.now()-i*86400000);
    days.push(cfbDay(date));
  }

  return [...new Set(days)];
}

function windowName(value:string){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "Other";

  const hour=Number(
    new Intl.DateTimeFormat("en-US",{
      timeZone:"America/Toronto",
      hour:"numeric",
      hourCycle:"h23"
    }).format(date)
  );

  return hour<14?"12 PM":hour<18?"Afternoon":"Evening";
}

function marketsFor(group:string,marketParam:CfbMarketKey|null){
  if(marketParam)return [marketParam];

  if(group==="QB"){
    return [...QB_MARKETS];
  }

  if(group==="Offense"){
    return [...OFFENSE_MARKETS];
  }

  // Fallback only. The shared dashboard currently uses QB / Offense.
  return CFB_MARKETS.map(x=>x[0]) as CfbMarketKey[];
}

function gameStarted(prediction:SavedCfbPrediction){
  const gameTime=Date.parse(String(prediction.gameTime||""));
  if(!Number.isFinite(gameTime))return true;

  return gameTime<=Date.now();
}

export async function GET(req:NextRequest){
  const period=req.nextUrl.searchParams.get("period")||"Today";
  const group=req.nextUrl.searchParams.get("group")||"QB";
  const marketParam=req.nextUrl.searchParams.get("market") as CfbMarketKey|null;
  const windowParam=req.nextUrl.searchParams.get("window");

  const validMarket=
    marketParam&&CFB_MARKETS.some(([key])=>key===marketParam)
      ?marketParam
      :null;

  if(marketParam&&!validMarket){
    return NextResponse.json(
      {
        success:false,
        connected:false,
        hits:0,
        settled:0,
        pending:0,
        total:0,
        hitRate:null,
        predictions:[],
        error:`Unknown CFB market: ${marketParam}`
      },
      {
        status:400,
        headers:{"Cache-Control":"no-store"}
      }
    );
  }

  const markets=marketsFor(group,validMarket);
  const days=daysFor(period);

  try{
    /*
      IMPORTANT:
      Only load the markets needed for the selected group.

      The old route loaded EVERY CFB market before it filtered QB/Offense.
      On a busy Saturday that meant a simple Week request could attempt to
      inspect/grade hundreds of unrelated rows and the shared performance panel
      could time out and fall back to zero.

      Oct. 1 durable history is already stored in Railway. This route now reads
      those saved files directly for Week/Month/Season and only grades the rows
      actually needed for the requested category.
    */
    const batch=await getCfbPredictionsForDays(markets,days);
    const all=[...batch.predictions];

    const byBucket=new Map<string,SavedCfbPrediction[]>();

    for(const prediction of all){
      const key=`${prediction.market}|${prediction.gameDate}`;
      byBucket.set(
        key,
        [...(byBucket.get(key)||[]),prediction]
      );
    }

    const summaryCache=new Map<string,Promise<any>>();
    const dayEventCache=new Map<string,Promise<any[]>>();
    const changedBuckets=new Set<string>();

    const eventsForDay=(day:string)=>{
      let promise=dayEventCache.get(day);
      if(!promise){
        promise=gamesForDay(day);
        dayEventCache.set(day,promise);
      }
      return promise;
    };

    const summaryForGame=(gameId:string)=>{
      let promise=summaryCache.get(gameId);
      if(!promise){
        promise=summary(gameId);
        summaryCache.set(gameId,promise);
      }
      return promise;
    };

    /*
      Grade pending historical rows, but do not waste external requests on
      games that have not started yet.
    */
    for(const [bucket,predictions] of byBucket){
      const [market,day]=bucket.split("|") as [CfbMarketKey,string];

      for(const prediction of predictions){
        if(prediction.status!=="pending")continue;
        if(!gameStarted(prediction))continue;

        let gameId=String(prediction.gameId||"");

        if(!gameId){
          const events=await eventsForDay(day);
          const matchup=cleanName(prediction.matchup);

          const event=events.find((candidate:any)=>
            matchup&&eventMatchup(candidate)===matchup
          );

          gameId=String(event?.id||"");
        }

        if(!gameId)continue;

        const payload=await summaryForGame(gameId);
        if(!payload||!summaryFinal(payload))continue;

        const actual=
          market==="first_td"
            ?firstTdResult(payload,prediction.playerName)
            :actualFromSummary(
                payload,
                market,
                prediction.playerId,
                prediction.playerName
              );

        if(actual==null)continue;

        prediction.actual=actual;
        prediction.status=settle(prediction,actual);
        prediction.gradedAt=new Date().toISOString();
        changedBuckets.add(bucket);
      }
    }

    /*
      Save any newly graded results back to the same durable Railway files.
    */
    for(const bucket of changedBuckets){
      const [market,day]=bucket.split("|") as [CfbMarketKey,string];
      const gradedRows=byBucket.get(bucket)||[];
      const stored=await getCfbPredictions(market,day);

      const gradedByKey=new Map(
        gradedRows.map(prediction=>[prediction.key,prediction])
      );

      const merged=stored.predictions.map(
        prediction=>gradedByKey.get(prediction.key)||prediction
      );

      await saveGradedCfbPredictions(
        market,
        day,
        merged,
        stored.id
      );
    }

    let scoped=all;

    if(windowParam){
      scoped=scoped.filter(
        prediction=>windowName(prediction.gameTime)===windowParam
      );
    }

    /*
      Only sportsbook-backed predictions belong in betting performance.
      TD scorer markets are gradeable even though they do not use a normal
      numeric over/under line.
    */
    const gradeable=scoped.filter(prediction=>
      prediction.market==="anytime_td"||
      prediction.market==="first_td"||
      prediction.sportsbookLine!=null
    );

    const hits=gradeable.filter(
      prediction=>prediction.status==="hit"
    ).length;

    const misses=gradeable.filter(
      prediction=>prediction.status==="miss"
    ).length;

    const pushes=gradeable.filter(
      prediction=>prediction.status==="push"
    ).length;

    const settled=hits+misses;

    const pending=gradeable.filter(
      prediction=>prediction.status==="pending"
    ).length;

    const sourceDays=[
      ...new Set(
        gradeable.map(prediction=>prediction.gameDate)
      )
    ].sort();

    return NextResponse.json(
      {
        success:true,
        connected:batch.connected||gradeable.length>0,
        period,
        group,
        market:validMarket,
        window:windowParam,
        total:gradeable.length,
        hits,
        misses,
        pushes,
        settled,
        pending,
        hitRate:settled
          ?Math.round(hits/settled*1000)/10
          :null,
        sourceDays,
        windows:["12 PM","Afternoon","Evening"],
        predictions:gradeable.sort(
          (a,b)=>b.savedAt.localeCompare(a.savedAt)
        )
      },
      {
        headers:{
          "Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"
        }
      }
    );
  }catch(error){
    return NextResponse.json(
      {
        success:false,
        connected:false,
        hits:0,
        misses:0,
        pushes:0,
        settled:0,
        pending:0,
        total:0,
        hitRate:null,
        predictions:[],
        error:error instanceof Error
          ?error.message
          :"CFB performance unavailable"
      },
      {
        status:500,
        headers:{"Cache-Control":"no-store"}
      }
    );
  }
}
