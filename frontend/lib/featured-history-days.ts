import {cloudConfigured,readCloudDocumentRange} from '../scripts/history-cloud.mjs';
import {readDurableHistory} from '@/lib/durable-history';
import {FEATURED_STREAMS,mergeFeaturedOriginals} from '@/lib/featured-originals';
/** A season uses indexed range reads, never hundreds of remote single-day misses. */
export async function featuredHistoryDays(sport:string,days:string[]){
 const sorted=[...days].sort();
 const sources=await Promise.all(sorted.map(async day=>({day,documents:await Promise.all(FEATURED_STREAMS.map(async stream=>({stream,payload:await readDurableHistory<any>(sport,stream,day,true)})))})));
 let complete=true;
 if(sorted.length&&cloudConfigured())await Promise.all(FEATURED_STREAMS.map(async stream=>{
  if(!sources.some(b=>!b.documents.find(d=>d.stream===stream)?.payload.length))return;
  try{
   const remote=await readCloudDocumentRange(sport,stream,sorted[0],sorted.at(-1)!);
   for(const board of sources){const document=board.documents.find(d=>d.stream===stream)!;if(!document.payload.length){const saved=remote.find(r=>r.game_date===board.day);if(Array.isArray(saved?.payload))document.payload=saved.payload;}}
  }catch{complete=false;}
 }));
 const boards=sources.map(({day,documents})=>({day,choices:mergeFeaturedOriginals(documents,day)}));
 return {boards,complete};
}
