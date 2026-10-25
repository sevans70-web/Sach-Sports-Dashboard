import {todayTopPlays} from '@/lib/top-plays';
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
export async function saveFeaturedSelections(sport:string,candidates:any[],day:string,now=Date.now()){
 return withHistoryLock('featured-selections|'+sport+'|'+day,async()=>{
  const previous=await readDurableHistory<any>(sport,'featured_selections',day);
  const merged=candidates.map(card=>{
   const prior=previous.find(c=>c.key===card.key)?.pick;
   const saved=prior&&dashboardDay(prior.row.gameTime)===day?prior:null;
   if(saved&&dashboardDay(saved.row.gameTime)===day&&Date.parse(saved.row.gameTime)<=now)return { ...card,pick:saved };
   return card.pick?card:saved?{...card,pick:saved}:card;
  });
  if(merged.some(c=>c.pick))await writeDurableHistory(sport,'featured_selections',day,merged);
  return merged;
 });
}
