import {providerFetch} from '@/lib/provider-fetch';
import {SOCCER_LEAGUES} from '@/lib/soccer';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {after,NextRequest,NextResponse} from 'next/server';
import {historyRoot} from '@/lib/durable-history';
import {DASHBOARD_SPORTS,dashboardDay,type DashboardSport} from '@/lib/dashboard-contract';
import {internalAppOrigin} from '@/lib/internal-app-origin';
import {protectHistory,replicateProtectedHistory} from '@/lib/protected-history';
import {gameSaveAction,isOfficialFinal,pregameCheckpointRows,rawOfficialFinal} from '@/lib/history-save-policy';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const running=new Set<string>();
const statusPath=(sport:string)=>path.join(historyRoot(),'_system','save-safeguards-'+sport+'.json');
async function readStatus(sport:string){try{return JSON.parse(await fs.readFile(statusPath(sport),'utf8'))}catch{return {games:{}}}}
async function request(route:string,timeout=15000){
 const response=await fetch(internalAppOrigin()+route,{cache:'no-store',signal:AbortSignal.timeout(timeout),headers:{'x-sach-history-scheduler':'1'}});
 const payload=await response.json();if(!response.ok)throw Error(`HTTP ${response.status}: ${route}`);return payload;
}
async function run(sport:string){
 const status=await readStatus(sport),games=new Map<string,any>(),boards:any[]=[],finals=new Set<string>(),now=Date.now(),errors:string[]=[];
 const dir=path.join(historyRoot(),sport),cutoff=dashboardDay(new Date(now-6*86400000));
 const names=await fs.readdir(dir).catch(()=>[]);
 for(const name of names.filter(n=>/^(featured_|slate_board_|protected_|predictions_)/.test(n)&&n.endsWith('.json')&&(n.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1]||'')>=cutoff))try{
  const values=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
  if(!Array.isArray(values))continue;
  for(const value of values){
   const item=value.payload||value;
   if(item.kind==='official_final_checkpoint')finals.add(String(item.gameId));
   if(item.rows)boards.push(item);
   if(item.gameId&&item.gameTime)boards.push({rows:[item]});
   if(item.pick?.row)boards.push({rows:[item.pick.row]});
  }
 }catch(e){errors.push(name+': unreadable evidence');}
 for(const board of boards)for(const row of board.rows||[])if(row.gameId&&row.gameTime)games.set(String(row.gameId),{gameId:String(row.gameId),gameTime:row.gameTime,league:row.leagueSlug||row.league||board.leagueSlug});
 let pregameRequested=false,finalsSaved=0,checked=0,pregameSaved=0;
 for(const board of boards){
  const rows=pregameCheckpointRows(board,now);
  for(const gameId of new Set(rows.map((r:any)=>String(r.gameId)))){
   const evidence=rows.filter((r:any)=>String(r.gameId)===gameId),market=board.market||evidence[0].market;
   if(!market)continue;
   await protectHistory(sport,'pregame_'+gameId+'_'+market,dashboardDay(evidence[0].gameTime),{kind:'pregame_checkpoint',gameId,market,checkpointAt:new Date(now).toISOString(),rows:evidence});pregameSaved++;
  }
 }

 for(const game of [...games.values()].sort((a,b)=>Date.parse(a.gameTime)-Date.parse(b.gameTime))){
  const previous=status.games[game.gameId]||{},action=gameSaveAction(game,previous.attemptAt||0,now);
  if(!action||finals.has(game.gameId))continue;
  if(action==='pregame'){
   pregameRequested=true;
   status.games[game.gameId]={...previous,attemptAt:now,phase:'pregame_capture_requested'};
   continue;
  }
  // Bound each tick; unfinished games rotate behind the five-minute retry window.
  if(checked>=2)continue;checked++;
  status.games[game.gameId]={...previous,attemptAt:now,phase:'awaiting_official_final'};
  try{
   let route:string|null=null;
   if(['nfl','cfb'].includes(sport))route=`/api/football/live-player-stats?sport=${sport}&gameId=${encodeURIComponent(game.gameId)}`;
   else if(['nba','wnba','cbb'].includes(sport))route=`/api/basketball/live-player-stats?sport=${sport}&gameId=${encodeURIComponent(game.gameId)}`;
   else if(sport==='nhl')route=`/api/nhl/live-player-stats?gameId=${encodeURIComponent(game.gameId)}`;
   let payload:any,final=false;
   if(route){payload=await request(route,5000);final=isOfficialFinal(payload,game.gameId);}
   else {
    const league=SOCCER_LEAGUES.find(value=>value[1]===game.league)?.[1];
    if(sport==='soccer'&&!league){status.games[game.gameId].phase='awaiting_verified_league';continue;}
    const url=sport==='mlb'?`https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(game.gameId)}/feed/live`:`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${encodeURIComponent(game.gameId)}`;
    const response=await providerFetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error(`Official source HTTP ${response.status}`);
    payload=await response.json();final=rawOfficialFinal(sport,game.gameId,payload);
   }
   if(final){
    await protectHistory(sport,'final_'+game.gameId,dashboardDay(game.gameTime),{kind:'official_final_checkpoint',...game,source:'official_final_boxscore',observedAt:new Date().toISOString(),boxscore:payload});
    status.games[game.gameId].phase='official_final_saved';finalsSaved++;
   }
  }catch(e){errors.push(game.gameId+': '+(e instanceof Error?e.message:String(e)));}
 }
 if(pregameRequested)try{
  const result=await request(`/api/history/capture?sport=${sport}&checkpoint=1`,180000);
  status.lastPregameCapture={at:new Date().toISOString(),success:result.success===true,saved:result.saved,failed:result.failed};
  if(result.success!==true)errors.push('Pregame market capture incomplete; will retry while pregame');
 }catch(e){errors.push('Pregame capture: '+(e instanceof Error?e.message:String(e)));}
 if(finalsSaved||(['mlb','soccer'].includes(sport)&&checked))try{
  await request(`/api/history/capture?sport=${sport}&phase=results`,180000);
 }catch(e){errors.push('Final grading: '+(e instanceof Error?e.message:String(e)));}
 const replication=now-(status.lastReplicationAttempt||0)>=60_000?await replicateProtectedHistory(sport,historyRoot(),2):status.replication;
 if(now-(status.lastReplicationAttempt||0)>=60_000)status.lastReplicationAttempt=now;
 status.updatedAt=new Date().toISOString();status.knownGames=games.size;status.checkedFinals=checked;status.finalsSaved=finalsSaved;status.pregameSaved=pregameSaved;status.replication=replication;status.errors=errors;
 // Do not retain an ever-growing operational status file beyond local history.
 for(const id of Object.keys(status.games))if(!games.has(id))delete status.games[id];
 await fs.mkdir(path.dirname(statusPath(sport)),{recursive:true});const temp=statusPath(sport)+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(status));await fs.rename(temp,statusPath(sport));
 console.log('[sach-save]',JSON.stringify({sport,knownGames:games.size,pregameSaved,finalsSaved,checkedFinals:checked,replication,errors}));
 return {sport,...status};
}
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport');
 if(sport&&!DASHBOARD_SPORTS.includes(sport as DashboardSport))return NextResponse.json({error:'Unsupported sport'},{status:400});
 const sports=sport?[sport]:[...DASHBOARD_SPORTS];
 return NextResponse.json({policy:{historyMinutes:10,pregameWindowMinutes:5,safeguardPollSeconds:30,finalRetryMinutes:5,driveBackupHours:6},sports:await Promise.all(sports.map(async sport=>({sport,...await readStatus(sport)})))},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'';
 if(!DASHBOARD_SPORTS.includes(sport as DashboardSport))return NextResponse.json({error:'Unsupported sport'},{status:400});
 if(!running.has(sport)){running.add(sport);after(async()=>{try{await run(sport)}catch(e){console.error('[sach-save]',sport,e)}finally{running.delete(sport)}});}
 return NextResponse.json({accepted:true,sport,running:true},{status:202,headers:{'Cache-Control':'no-store'}});
}
