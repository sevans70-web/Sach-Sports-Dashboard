import {FOOTBALL_SLATES} from '@/lib/football-slate-rankings';
/** A slow block must not erase its saved board or prevent other blocks loading.
 * An unavailable block is distinct from a healthy block with zero candidates. */
export async function loadIndependentFootballBlocks(load:(slate:typeof FOOTBALL_SLATES[number])=>Promise<any>,cached:(slate:typeof FOOTBALL_SLATES[number])=>any){
 const blocks=await Promise.all(FOOTBALL_SLATES.map(async slate=>{
  let block:any=null;try{block=await load(slate)}catch{}
  if(block?.success===false||!Array.isArray(block?.rows))block=null;
  if(!block){const prior=cached(slate);if(prior?.success!==false&&Array.isArray(prior?.rows))block={...prior,cached:true,stale:true};}
  return block?{...block,slate}:null;
 }));
 const unavailableSlates=FOOTBALL_SLATES.filter((_,i)=>!blocks[i]);
 const usable=blocks.filter(Boolean);
 return {blocks:usable,rows:usable.flatMap(block=>block.rows.map((row:any)=>({...row,slateKey:block.slate,slateLabel:block.slateLabel}))),
  blockCounts:Object.fromEntries(FOOTBALL_SLATES.map((key,i)=>[key,blocks[i]?.rows.length??null])),
  unavailableSlates,complete:unavailableSlates.length===0,stale:usable.some(b=>b.stale===true)};
}
