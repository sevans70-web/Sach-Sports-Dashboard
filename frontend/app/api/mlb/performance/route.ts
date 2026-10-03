import {promises as fs} from "node:fs";
import path from "node:path";
import {NextResponse} from "next/server";
import {getPerformance} from "@/lib/mlb-server";
import {torontoDay,upsertSourceSnapshot} from "@/lib/prediction-storage";

export const dynamic="force-dynamic";
export const revalidate=0;

const ROOT=process.env.SACH_HISTORY_DIR||"/data/sach-history";
const RECOVERY_DIR=path.join(ROOT,"mlb","performance");

const BATTER_CATEGORIES=[
  "home_runs","hits","total_bases","runs","rbis","walks",
  "stolen_bases","hits_runs_rbis","batter_strikeouts"
] as const;
const PITCHER_CATEGORIES=[
  "strikeouts","outs_recorded","hits_allowed","walks_allowed","earned_runs"
] as const;

function dayOffset(n:number){
  return torontoDay(new Date(Date.now()+n*86400000));
}

function countDay(history:any,day:string):number{
  const categories:Record<string,any>=history?.days?.[day]?.categories||{};
  return (Object.values(categories) as any[]).reduce<number>(
    (total,rows)=>total+(Array.isArray(rows)?rows.length:0),0
  );
}

function mergeRecoveredDay(history:any,day:string,recovered:any){
  if(!recovered?.categories)return history;
  const out=structuredClone(history&&typeof history==="object"?history:{schema_version:1,days:{}});
  out.days=out.days||{};
  if(countDay(out,day)>0)return out;
  out.days[day]=recovered;
  return out;
}

function localFile(day:string){
  return path.join(RECOVERY_DIR,`${day}.json`);
}

async function readLocalDay(day:string){
  try{
    const parsed=JSON.parse(await fs.readFile(localFile(day),"utf8"));
    return parsed&&typeof parsed==="object"?parsed:null;
  }catch{return null}
}

async function writeLocalDay(day:string,payload:any){
  try{
    await fs.mkdir(RECOVERY_DIR,{recursive:true});
    const target=localFile(day),tmp=`${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp,JSON.stringify(payload,null,2),"utf8");
    await fs.rename(tmp,target);
    return true;
  }catch{return false}
}

async function archiveSnapshots(stream:string,day:string){
  const file=path.join(ROOT,"mlb","archive",`${stream}_${day}.json`);
  try{
    const parsed=JSON.parse(await fs.readFile(file,"utf8"));
    return Array.isArray(parsed)?parsed:[];
  }catch{return []}
}

function rowsFromPayload(payload:any,category:string,pitcher=false){
  const roots=pitcher
    ? [payload?.pitcher,payload?.rankings,payload?.data?.pitcher,payload]
    : [payload?.batter,payload?.rankings,payload?.data?.batter,payload];

  for(const root of roots){
    if(!root||typeof root!=="object")continue;
    const value=root?.[category];
    const rows=Array.isArray(value)
      ? value
      : Array.isArray(value?.rankings)
        ? value.rankings
        : [];
    if(rows.length)return rows;
  }
  return [];
}

async function archivedRows(category:string,day:string,pitcher=false){
  const snapshots=await archiveSnapshots(category,day);
  for(let i=snapshots.length-1;i>=0;i--){
    const rows=rowsFromPayload(snapshots[i]?.payload,category,pitcher);
    if(rows.length)return rows;
  }
  return [];
}

async function homeRunPool(day:string){
  const snapshots=await archiveSnapshots("home_runs",day);
  for(let i=snapshots.length-1;i>=0;i--){
    const payload=snapshots[i]?.payload||{};
    const roots=[payload?.batter,payload?.rankings,payload?.data?.batter,payload];
    for(const root of roots){
      const rows=root?.home_runs_pool;
      if(Array.isArray(rows)&&rows.length)return rows;
    }
  }
  return [];
}

function num(v:any){
  const n=Number(v);
  return Number.isFinite(n)?n:0;
}

function normName(v:any){
  return String(v||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[’']/g,"")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi,"")
    .replace(/[^a-z0-9]+/gi," ")
    .trim().toLowerCase();
}

async function mlbResults(day:string){
  const scheduleUrl=`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(day)}`;
  let schedule:any=null;
  try{
    const r=await fetch(scheduleUrl,{cache:"no-store"});
    if(r.ok)schedule=await r.json();
  }catch{}

  const games=(schedule?.dates?.flatMap((d:any)=>d.games||[])||[])
    .filter((g:any)=>{
      const state=String(g?.status?.abstractGameState||g?.status?.detailedState||"");
      return /final|completed|game over/i.test(state);
    });

  const byId=new Map<string,any>();
  const byName=new Map<string,any>();

  await Promise.all(games.map(async(game:any)=>{
    try{
      const r=await fetch(`https://statsapi.mlb.com/api/v1/game/${encodeURIComponent(String(game.gamePk))}/boxscore`,{cache:"no-store"});
      if(!r.ok)return;
      const box=await r.json();

      for(const side of ["away","home"]){
        for(const player of Object.values(box?.teams?.[side]?.players||{}) as any[]){
          const id=String(player?.person?.id||"");
          const name=String(player?.person?.fullName||"");
          const row={
            id,name,
            batting:player?.stats?.batting||null,
            pitching:player?.stats?.pitching||null,
            gamePk:String(game.gamePk)
          };
          if(id)byId.set(id,row);
          const key=normName(name);
          if(key)byName.set(key,row);
        }
      }
    }catch{}
  }));

  return {byId,byName};
}

function resultFor(row:any,results:any,pitcher=false){
  const id=String(
    pitcher
      ? row?.pitcher_id||row?.player_id||""
      : row?.player_id||row?.batter_id||""
  );
  const name=normName(
    pitcher
      ? row?.pitcher_name||row?.player_name
      : row?.player_name||row?.player
  );
  return (id&&results.byId.get(id))||results.byName.get(name)||null;
}

function recoverBatterCategory(rows:any[],category:string,results:any){
  const threshold:Record<string,number>={
    home_runs:1,hits:1,total_bases:2,runs:1,rbis:1,walks:1,
    stolen_bases:1,hits_runs_rbis:2,batter_strikeouts:1,emerging_power:1
  };

  return rows.slice(0,25).map((raw:any,index:number)=>{
    const row={...raw,category,rank:Number(raw?.rank||index+1)};
    const found=resultFor(row,results,false);
    const stat=found?.batting;
    if(!stat)return row;

    const actual:any={
      home_runs:num(stat.homeRuns),
      hits:num(stat.hits),
      total_bases:num(stat.totalBases),
      runs:num(stat.runs),
      rbis:num(stat.rbi),
      walks:num(stat.baseOnBalls),
      stolen_bases:num(stat.stolenBases),
      batter_strikeouts:num(stat.strikeOuts)
    };
    actual.hits_runs_rbis=actual.hits+actual.runs+actual.rbis;

    const key=category==="emerging_power"?"home_runs":category;
    const reached=actual[key]>=threshold[category];

    return {
      ...row,
      game_pk:row?.game_pk||row?.gamePk||found.gamePk,
      actual:actual[key],
      actual_hits:actual.hits,
      actual_home_runs:actual.home_runs,
      actual_total_bases:actual.total_bases,
      actual_runs:actual.runs,
      actual_rbis:actual.rbis,
      actual_walks:actual.walks,
      actual_stolen_bases:actual.stolen_bases,
      actual_hits_runs_rbis:actual.hits_runs_rbis,
      actual_batter_strikeouts:actual.batter_strikeouts,
      correct:reached,
      game_finished:true,
      result_live:false,
      result_label:reached?"✅ Hit":"❌ Miss"
    };
  });
}

function recoverPitcherCategory(rows:any[],category:string,results:any){
  const fields:Record<string,string>={
    strikeouts:"strikeOuts",
    outs_recorded:"outs",
    hits_allowed:"hits",
    walks_allowed:"baseOnBalls",
    earned_runs:"earnedRuns"
  };

  return rows.slice(0,25).map((raw:any,index:number)=>{
    const row={...raw,category,rank:Number(raw?.rank||index+1)};
    const found=resultFor(row,results,true);
    const stat=found?.pitching;
    if(!stat)return row;

    let actual=num(stat[fields[category]]);
    if(category==="outs_recorded"&&typeof stat.outs==="undefined"){
      const ip=String(stat.inningsPitched||"0");
      const [whole,frac]=ip.split(".");
      actual=num(whole)*3+num(frac);
    }

    const projection=Number(row?.projection??row?.[`projected_${category}`]);
    const absoluteError=Number.isFinite(projection)?Math.abs(actual-projection):null;

    return {
      ...row,
      game_pk:row?.game_pk||row?.gamePk||found.gamePk,
      actual,
      absolute_error:absoluteError,
      finalized:absoluteError!=null,
      game_finished:true,
      result_live:false,
      result_label:absoluteError==null?"Final":absoluteError<=1?"Within 1":"Outside 1"
    };
  });
}

function emergingCandidates(rows:any[]){
  return rows.filter((r:any)=>{
    const rank=num(r?.rank||r?.hr_rank);
    const season=r?.season_stats||{};
    const hr=num(r?.season_home_runs||season?.home_runs||season?.homeRuns);
    const pa=num(r?.season_plate_appearances||season?.plate_appearances||season?.plateAppearances||season?.pa);
    const gi=num(r?.gi_score||r?.score);
    const prob=num(r?.home_run_probability||r?.hr_probability||r?.probability);
    return !(rank>=1&&rank<=25)&&hr<=18&&(hr<=15||(pa>0&&pa<=325))&&(gi>=52||prob>=10);
  }).slice(0,10);
}

async function recoverArchiveDay(day:string){
  const results=await mlbResults(day);
  const batterCategories:Record<string,any[]>={};
  const pitcherCategories:Record<string,any[]>={};

  for(const category of BATTER_CATEGORIES){
    const rows=await archivedRows(category,day,false);
    if(rows.length)batterCategories[category]=recoverBatterCategory(rows,category,results);
  }

  for(const category of PITCHER_CATEGORIES){
    const rows=await archivedRows(category,day,true);
    if(rows.length)pitcherCategories[category]=recoverPitcherCategory(rows,category,results);
  }

  let pool=await homeRunPool(day);
  if(!pool.length)pool=await archivedRows("home_runs",day,false);
  const emerging=emergingCandidates(pool);

  return {
    batter:{captured_at:new Date().toISOString(),categories:batterCategories},
    pitcher:{captured_at:new Date().toISOString(),categories:pitcherCategories},
    emerging:{
      captured_at:new Date().toISOString(),
      categories:{
        emerging_power:recoverBatterCategory(emerging,"emerging_power",results)
      }
    }
  };
}

function snapshotDay(data:any,day:string){
  return {
    batter:data?.batter?.days?.[day]||null,
    pitcher:data?.pitcher?.days?.[day]||null,
    emerging:data?.emerging?.days?.[day]||null
  };
}

function hasAnyDay(payload:any){
  const parts=[payload?.batter,payload?.pitcher,payload?.emerging];
  return parts.some(part=>
    Object.values(part?.categories||{}).some((rows:any)=>Array.isArray(rows)&&rows.length)
  );
}

export async function GET(){
  const data:any=await getPerformance();
  const today=dayOffset(0);
  const yesterday=dayOffset(-1);

  let localRecovered=false;
  let archiveRecovered=false;

  // First save whatever the normal engine produced to Railway's persistent
  // volume. This gives MLB a local safety net when Supabase is unavailable.
  const todaySnapshot=snapshotDay(data,today);
  if(hasAnyDay(todaySnapshot))await writeLocalDay(today,todaySnapshot);

  const yesterdaySnapshot=snapshotDay(data,yesterday);
  if(hasAnyDay(yesterdaySnapshot)){
    await writeLocalDay(yesterday,yesterdaySnapshot);
  }else{
    // Restore yesterday from the local durable copy first.
    let recovered=await readLocalDay(yesterday);
    if(recovered&&hasAnyDay(recovered)){
      localRecovered=true;
    }else{
      // If the old performance writer failed, rebuild yesterday from the
      // ranking archive that is already on the Railway volume.
      recovered=await recoverArchiveDay(yesterday);
      if(hasAnyDay(recovered)){
        archiveRecovered=true;
        await writeLocalDay(yesterday,recovered);
      }
    }

    if(recovered&&hasAnyDay(recovered)){
      data.batter=mergeRecoveredDay(data.batter,yesterday,recovered.batter);
      data.pitcher=mergeRecoveredDay(data.pitcher,yesterday,recovered.pitcher);
      data.emerging=mergeRecoveredDay(data.emerging,yesterday,recovered.emerging);
    }
  }

  // Keep Supabase persistence too; local Railway history is the fallback, not
  // a replacement for the existing source_snapshots history.
  const writes=await Promise.all([
    upsertSourceSnapshot("mlb_batter_performance_history",today,data.batter),
    upsertSourceSnapshot("mlb_pitcher_performance_history",today,data.pitcher),
    upsertSourceSnapshot("mlb_emerging_power_history",today,data.emerging),
  ]);

  return NextResponse.json({
    success:true,
    ...data,
    lifecyclePersistence:{
      saved:writes.every(x=>x.ok),
      batter:writes[0].ok,
      pitcher:writes[1].ok,
      emerging:writes[2].ok,
      errors:writes.map(x=>x.error).filter(Boolean),
      railwayLocal:true,
      localRecovered,
      archiveRecovered
    },
  },{headers:{"Cache-Control":"no-store, no-cache, must-revalidate, max-age=0"}});
}
