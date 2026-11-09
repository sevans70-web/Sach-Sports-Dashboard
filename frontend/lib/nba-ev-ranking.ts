import {estimatedEv,nbaDisplayedResearchEv} from '@/lib/estimated-ev';

/** Positive evidence is a condition to ENTER the NBA ranked display.
 * Never calculate an EV from odds alone, never switch pick direction, and
 * never mutate an immutable saved selection, rank, line or projection.
 */
export function nbaCardEv(card:{raw:any},now=Date.now()){
 const raw=card?.raw;
 if(!raw||raw.sport!=='nba')return null;
 const selected=estimatedEv(raw,now);
 if(selected.status==='available'&&Number.isFinite(selected.percent)&&selected.percent>0)
  return {percent:selected.percent,side:selected.side,kind:'model_selection' as const,validatedForBetting:selected.validatedForBetting===true};
 const research=nbaDisplayedResearchEv(raw,now);
 if(research&&Number.isFinite(research.percent)&&research.percent>0)
  return {percent:research.percent,side:research.side,kind:'research_comparison' as const,validatedForBetting:false};
 return null;
}

export function rankNbaCardsByEv<T extends {raw:any;rank:number;playerId:string}>(cards:T[],now=Date.now()):T[]{
 return cards
  .map((card,index)=>({card,index,ev:nbaCardEv(card,now)}))
  .filter((entry):entry is typeof entry & {ev:NonNullable<typeof entry.ev>}=>entry.ev!==null)
  .sort((a,b)=>b.ev.percent-a.ev.percent||a.index-b.index)
  .map(({card},index)=>({...card,rank:index+1}));
}
