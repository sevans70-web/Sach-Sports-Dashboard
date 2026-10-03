import {NextRequest,NextResponse} from "next/server";
import {NHL_MARKETS,type NhlMarketKey} from "@/lib/nhl";
import {getNhlPredictions,nhlDay,saveNhlGrades,type SavedNhlPrediction} from "@/lib/nhl-history";

export const dynamic="force-dynamic";
export const revalidate=0;

const markets=NHL_MARKETS.map(x=>x[0]) as NhlMarketKey[];
const allowed=new Set<NhlMarketKey>(markets);
const BOX="https://api-web.nhle.com/v1/gamecenter";

function dayOffset(n:number){
  return nhlDay(new Date(Date.now()+n*86400000));
}

function range(period:string){
  if(period==="Yesterday")return[dayOffset(-1)];
  if(period==="Week")return Array.from({length:7},(_,i)=>dayOffset(-i));
  if(period==="Month")return Array.from({length:31},(_,i)=>dayOffset(-i));
  if(period==="Season")return Array.from({length:370},(_,i)=>dayOffset(-i));
  return[dayOffset(0)];
}

async function boxscore(gameId:string){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
    const r=await fetch(`${BOX}/${encodeURIComponent(gameId)}/boxscore`,{
      cache:"no-store",
      signal:controller.signal,
      headers:{Accept:"application/json","User-Agent":"Sach-Sports/1.0"}
    });
    return r.ok?await r.json():null;
  }catch{return null}finally{clearTimeout(timer)}
}

function finalGame(payload:any){
  const state=String(
    payload?.gameState||
    payload?.gameScheduleState||
    payload?.gameOutcome?.lastPeriodType||
    ""
  ).toUpperCase();
  return state==="FINAL"||state==="OFF"||Boolean(payload?.gameOutcome);
}

function num(v:any){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function parseSaves(v:any){
  const direct=num(v);
  if(direct!=null)return direct;
  const text=String(v??"");
  const first=text.match(/(\d+)\s*\/\s*(\d+)/);
  return first?Number(first[1]):null;
}

function findPlayer(payload:any,p:SavedNhlPrediction){
  const root=payload?.playerByGameStats||{};
  const wantedId=String(p.playerId||"");
  const teams=[root?.awayTeam,root?.homeTeam];
  for(const team of teams){
    for(const groupName of ["forwards","defense","goalies"]){
      for(const row of Array.isArray(team?.[groupName])?team[groupName]:[]){
        if(String(row?.playerId||"")===wantedId)return row;
      }
    }
  }
  return null;
}

function actualFor(payload:any,p:SavedNhlPrediction){
  const row=findPlayer(payload,p);
  if(!row)return null;

  if(p.market==="shots_on_goal")return num(row?.sog??row?.shots);
  if(p.market==="goals")return num(row?.goals);
  if(p.market==="assists")return num(row?.assists);
  if(p.market==="points"){
    const direct=num(row?.points);
    if(direct!=null)return direct;
    const g=num(row?.goals),a=num(row?.assists);
    return g!=null&&a!=null?g+a:null;
  }
  if(p.market==="blocked_shots")return num(row?.blockedShots??row?.blocks);

  const direct=num(row?.saves);
  if(direct!=null)return direct;
  const saveShots=parseSaves(row?.saveShotsAgainst);
  if(saveShots!=null)return saveShots;
  const shotsAgainst=num(row?.shotsAgainst),goalsAgainst=num(row?.goalsAgainst);
  return shotsAgainst!=null&&goalsAgainst!=null?shotsAgainst-goalsAgainst:null;
}

function settle(p:SavedNhlPrediction,actual:number){
  if(p.sportsbookLine==null||!p.pickSide)return "void";
  if(actual===p.sportsbookLine)return "push";
  return p.pickSide==="UNDER"
    ? actual<p.sportsbookLine?"hit":"miss"
    : actual>p.sportsbookLine?"hit":"miss";
}

export async function GET(req:NextRequest){
  const p=req.nextUrl.searchParams.get("market") as NhlMarketKey|null;
  const period=req.nextUrl.searchParams.get("period")||"Today";

  if(p&&!allowed.has(p)){
    return NextResponse.json({connected:false,hits:0,settled:0,pending:0,total:0,hitRate:null,results:[]});
  }

  const use=p?[p]:markets;
  const all:SavedNhlPrediction[]=[];
  const boxCache=new Map<string,any>();
  let connected=false;

  for(const d of range(period)){
    for(const m of use){
      const x=await getNhlPredictions(m,d);
      connected=connected||x.connected||x.predictions.length>0;
      let changed=false;
      const graded:SavedNhlPrediction[]=[];

      for(const prediction of x.predictions){
        const row={...prediction};

        if(row.status==="pending"&&row.gameId){
          let payload=boxCache.get(String(row.gameId));
          if(payload===undefined){
            payload=await boxscore(String(row.gameId));
            boxCache.set(String(row.gameId),payload);
          }

          if(payload&&finalGame(payload)){
            // Model-only cards are useful rankings, but they are not betting
            // performance. Finalize them as void so they never inflate Pending.
            if(row.sportsbookLine==null||!row.pickSide){
              row.status="void";
              row.gradedAt=new Date().toISOString();
              changed=true;
            }else{
              const actual=actualFor(payload,row);
              if(actual==null){
                // A final box score with no player row means the wager is not
                // scoreable from an appearance; keep it out of hit rate.
                row.status="void";
                row.gradedAt=new Date().toISOString();
                changed=true;
              }else{
                row.actual=actual;
                row.status=settle(row,actual);
                row.gradedAt=new Date().toISOString();
                changed=true;
              }
            }
          }
        }

        graded.push(row);
      }

      if(changed)await saveNhlGrades(m,d,graded);
      all.push(...graded);
    }
  }

  // Only verified sportsbook-backed predictions belong in betting performance.
  const gradeable=all.filter(x=>x.sportsbookLine!=null&&Boolean(x.pickSide));
  const settled=gradeable.filter(x=>x.status==="hit"||x.status==="miss");
  const hits=settled.filter(x=>x.status==="hit").length;
  const pending=gradeable.filter(x=>x.status==="pending").length;

  return NextResponse.json({
    success:true,
    connected:connected||gradeable.length>0,
    hits,
    settled:settled.length,
    pending,
    total:gradeable.length,
    hitRate:settled.length?Math.round(hits/settled.length*1000)/10:null,
    results:gradeable.sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt))).slice(0,100),
    updatedAt:new Date().toISOString()
  },{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
