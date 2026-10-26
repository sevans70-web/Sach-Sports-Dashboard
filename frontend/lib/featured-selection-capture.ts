import {protectHistory,replicateProtectedHistory} from '@/lib/protected-history';
import {todayTopPlays,distinctFeaturedPlayers} from '@/lib/top-plays';
import {dashboardDay} from '@/lib/dashboard-contract';
import {readDurableHistory,writeDurableHistory} from '@/lib/durable-history';
import {withHistoryLock} from '@/lib/history-lock';
/** Capture the choices independently of whether anyone opens a dashboard. */
export async function captureFeaturedSelections(sport:string,boards:any[],now=Date.now()){
 const today=dashboardDay(new Date(now));
 const rows=boards.flatMap(b=>(b?.rows||[]).map((r:any)=>({...r,market:r.market||b.market})));
 const days=[...new Set<string>(rows.map((r:any)=>dashboardDay(r.gameTime)).filter((d:string)=>d>=today))];
 for(const day of days){
  const candidates=todayTopPlays(rows.filter((r:any)=>dashboardDay(r.gameTime)===day),sport,now);
  if(candidates.some(c=>c.pick))await saveFeaturedSelections(sport,candidates,day,now);
 }
}
export async function saveFeaturedSelections(sport:string,candidates:any[],day:string,now=Date.now(),deferCloud?:(work:()=>Promise<any>)=>void){
 return withHistoryLock('featured-selections|'+sport+'|'+day,async()=>{
  const previous=await readDurableHistory<any>(sport,'featured_selections',day);
  let merged=distinctFeaturedPlayers(candidates.map(card=>{
   const prior=previous.find(c=>c.key===card.key)?.pick;
   const saved=prior&&dashboardDay(prior.row.gameTime)===day?prior:null;
   if(saved)return {...card,pick:saved};
   return card;
  }));
  if(merged.some(c=>c.pick)){
   // Protect each category before publishing it. Historical imports retain their
   // recorded timestamp and are never relabelled as a newly verified pregame pick.
   for(const card of merged.filter(c=>c.pick)){const receipt=await protectHistory(sport,'featured_original_'+card.key,day,card);card.pick=receipt[0].payload.pick;}
   merged=distinctFeaturedPlayers(merged);
   const changed=JSON.stringify(previous)!==JSON.stringify(merged);
   if(changed)await writeDurableHistory(sport,'featured_selections',day,merged,deferCloud);
   const replicate=async()=>{await replicateProtectedHistory(sport,undefined,1)};
   if(changed){if(deferCloud)deferCloud(replicate);else await replicate();}
  }
  return merged;
 });
}
