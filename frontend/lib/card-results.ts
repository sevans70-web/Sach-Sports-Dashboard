import {rankingLineProgress} from "@/lib/ranking-card-state";
import {voidRecordNote} from '@/lib/record-notes';
const num=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
export function scorerTarget(market:string){return market==='first_td'?'First TD scorer':market==='first_basket'?'First basket scorer':'1+ TD'}
export function cardObservedProgress(actual:any,line:any,market:string){
 return market==='anytime_td'?rankingLineProgress(actual,1,'touchdowns'):rankingLineProgress(actual,line,market);
}
/** Preserve the difference between a historical research outcome and a validated wager. */
export function researchFinalOutcome(row:any,actual:any,line:any,market:string){
 const note=voidRecordNote(row);if(note)return {label:'VOID · NOT SCORED',detail:note.text};
 const value=num(actual),threshold=num(line);
 if(value==null)return {label:'FINAL · STAT UNAVAILABLE',detail:'Official final statistic has not been reported.'};
 if(row.quoteVerified!==true||threshold==null)return {label:'FINAL · ACTUAL RECORDED',detail:`Actual ${value} · verified line unavailable; no pick grade.`};
 const scorer=market==='anytime_td',side=String(row.originalResearchPick||row.archivedOriginal?.prediction||'').toUpperCase();
 const saved=Date.parse(row.originalResearchSavedAt||row.savedAt||''),kickoff=Date.parse(row.gameTime||'');
 const frozen=row.frozen===true||row.lockedAtKickoff===true;
 const originalSaved=frozen&&Number.isFinite(saved)&&saved<kickoff&&['OVER','UNDER','YES'].includes(side);
 if(originalSaved){
  const push=!scorer&&value===threshold,met=scorer?value>=1:side==='UNDER'?value<threshold:value>threshold;
  return {label:push?'➖ RESEARCH PUSH':`${met?'✅':'❌'} RESEARCH ${side} ${met?'MET':'MISSED'}`,detail:`Actual ${value} · ${scorer?'target 1+ TD':`recorded line ${threshold}`} · original saved research only; excluded from betting performance.`};
 }
 return {label:scorer?(value>=1?'TD TARGET REACHED':'NO TOUCHDOWN'):value===threshold?'FINISHED ON LINE':value>threshold?'FINISHED ABOVE LINE':'FINISHED BELOW LINE',detail:`Actual ${value} · ${scorer?'target 1+ TD':`recorded line ${threshold}`} · no validated Sach pick issued.`};
}
