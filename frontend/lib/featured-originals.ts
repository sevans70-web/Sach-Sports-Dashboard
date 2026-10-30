import {dashboardDay} from '@/lib/dashboard-contract';
import {readDurableHistoryBatch} from '@/lib/durable-history';

export const FEATURED_KEYS=['play','value','first','long'] as const;
export const FEATURED_STREAMS=['featured_selections',...FEATURED_KEYS.map(key=>'protected_featured_original_'+key)];

/** Immutable category receipts take precedence over a missing or later summary.
 * Recover recorded evidence only; never reconstruct a designation from rankings.
 */
export function mergeFeaturedOriginals(documents:{stream:string;payload:any[]}[],day:string){
 const choices=[...(documents.find(d=>d.stream==='featured_selections')?.payload||[])];
 for(const key of FEATURED_KEYS){
  const receipt=documents.find(d=>d.stream==='protected_featured_original_'+key)?.payload?.[0];
  const card=receipt?.payload;
  if(card?.key!==key||!card.pick?.row||dashboardDay(card.pick.row.gameTime)!==day)continue;
  const index=choices.findIndex(c=>c.key===key);
  if(index<0)choices.push(card);else choices[index]=card;
 }
 return choices;
}

export async function readFeaturedOriginals(sport:string,day:string){
 return mergeFeaturedOriginals(await readDurableHistoryBatch(sport,FEATURED_STREAMS,day,{requireComplete:true}),day);
}
