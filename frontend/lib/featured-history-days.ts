import {cloudConfigured,readCloudDocumentRange} from '../scripts/history-cloud.mjs';
import {readDurableHistory} from '@/lib/durable-history';
/** A season uses indexed range reads, never hundreds of remote single-day misses. */
export async function featuredHistoryDays(sport:string,days:string[]){
 const sorted=[...days].sort(),boards=await Promise.all(sorted.map(async day=>({day,choices:await readDurableHistory<any>(sport,'featured_selections',day,true)})));
 let complete=true;
 if(cloudConfigured()&&boards.some(b=>!b.choices.length))try{
  const remote=await readCloudDocumentRange(sport,'featured_selections',sorted[0],sorted.at(-1)!);
  for(const board of boards)if(!board.choices.length){const saved=remote.find(r=>r.game_date===board.day);if(Array.isArray(saved?.payload))board.choices=saved.payload;}
 }catch{complete=false;}
 return {boards,complete};
}
