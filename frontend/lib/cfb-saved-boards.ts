import {promises as fs} from 'node:fs';
import path from 'node:path';
import {historyRoot} from '@/lib/durable-history';
import {historyDays} from '@/lib/history-days';
import {recordedProjectionValue} from '@/lib/saved-projection';
/** Read persisted time-block originals without rebuilding a board or requesting results. */
export async function readCfbSavedBoards(period:string,now=new Date(),root=historyRoot()){
 const days=historyDays(period,now),dir=path.join(root,'cfb-ranking-boards');
 let names:string[];try{names=await fs.readdir(dir)}catch(e:any){if(e.code==='ENOENT')return [];throw e;}
 const records=new Map<string,any>();
 for(const name of names.sort((a,b)=>Number(a.endsWith('_all.json'))-Number(b.endsWith('_all.json'))||a.localeCompare(b))){
  const match=name.match(/^(\d{4}-\d{2}-\d{2})_(.+)_(all|early|afternoon|evening)\.json$/);if(!match||!days.has(match[1]))continue;
  const state=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
  if(state.day!==match[1]||state.market!==match[2]||state.slate!==match[3]||!Array.isArray(state.rows))continue;
  const originals=[...Object.values(state.locked||{}),...state.rows] as any[];
  for(const row of originals){
   if(!row.playerId||!row.gameId||(row.market!=null&&row.market!==state.market)||row.recoveredAfterStart===true)continue;
   const key=[row.playerId,row.gameId,state.market].join('|');if(records.has(key))continue;
   const final=['post','final'].includes(row.gameState),status=row.resultStatus;
   records.set(key,{key,playerId:row.playerId,gameId:row.gameId,playerName:row.playerName,teamName:row.teamName,matchup:row.matchup,rank:row.rank,market:state.market,gameTime:row.gameTime,gameDate:state.day,
    projection:recordedProjectionValue(row),projectionBasis:row.researchForecast?.status==='available'?'fitted':'historical_baseline',line:row.sportsbookLine??null,
    actual:row.actualResult??row.liveCurrent??null,status:final&&['hit','miss','push','void'].includes(status)?status:'pending',source:'saved_time_block_board'});
  }
 }
 return [...records.values()];
}
