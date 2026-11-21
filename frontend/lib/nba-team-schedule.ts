/** Independent official team-calendar resource, not an alias for a denied athlete log. */
export function nbaTeamScheduleSource(teamId:string,season:string){
 if(!/^\d+$/.test(teamId)||!/^\d{4}$/.test(season))throw Error('nba_schedule_identity_invalid');
 return `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${season}&seasontype=2`;
}
const score=(v:any)=>typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):typeof v?.value==='number'?v.value:NaN;
/** Retain exact model-relevant official fields. Reconcile the entire completed
 * calendar against the independently supplied regular-season team record so
 * a truncated first response cannot establish fresh discovery. */
export function validatedNbaTeamSchedule(input:any,teamId:string,season:string){
 const record=String(input?.team?.recordSummary||'').match(/^(\d+)-(\d+)$/);
 if(input?.status!=='success'||String(input?.team?.id)!==teamId||String(input?.season?.year)!==season||Number(input?.season?.type)!==2||String(input?.requestedSeason?.year)!==season||Number(input?.requestedSeason?.type)!==2||!record||!Array.isArray(input?.events)||!input.events.length||input.events.length>200)throw Error('nba_schedule_incomplete');
 const seen=new Set<string>();let wins=0,losses=0;
 const events=input.events.map((e:any)=>{
  const id=String(e.id||''),c=e.competitions?.[0],sides=c?.competitors||[],status=c?.status?.type;
  if(!/^\d+$/.test(id)||seen.has(id)||e.competitions?.length!==1||String(c.id)!==id||String(e.season?.year)!==season||Number(e.seasonType?.type??e.seasonType?.id)!==2||!Number.isFinite(Date.parse(e.date))||Date.parse(e.date)!==Date.parse(c.date)||sides.length!==2||new Set(sides.map((s:any)=>String(s.team?.id))).size!==2||new Set(sides.map((s:any)=>s.homeAway)).size!==2||sides.some((s:any)=>!/^\d+$/.test(String(s.team?.id))||!['home','away'].includes(s.homeAway))||!sides.some((s:any)=>String(s.team.id)===teamId)||!['pre','in','post'].includes(status?.state)||typeof status.completed!=='boolean')throw Error('nba_schedule_event_invalid');
  seen.add(id);
  if(status.completed){
   const own=sides.find((s:any)=>String(s.team.id)===teamId),other=sides.find((s:any)=>s!==own),a=score(own.score),b=score(other.score);
   if(status.state!=='post'||![a,b].every(n=>Number.isInteger(n)&&n>=0)||a===b||typeof own.winner!=='boolean'||typeof other.winner!=='boolean'||own.winner!==(a>b)||other.winner!==(b>a))throw Error('nba_schedule_final_invalid');
   if(own.winner)wins++;else losses++;
  }
  return {id,date:e.date,season:{year:e.season.year},seasonType:{type:2},competitions:[{id:c.id,date:c.date,status:{type:{state:status.state,completed:status.completed}},competitors:sides.map((s:any)=>({team:{id:String(s.team.id)},homeAway:s.homeAway,...(status.completed?{winner:s.winner,score:score(s.score)}:{})}))}]};
 });
 if(wins!==Number(record[1])||losses!==Number(record[2])||wins+losses===0)throw Error('nba_schedule_record_mismatch');
 return {status:'success',timestamp:input.timestamp??null,season:{year:Number(season),type:2},requestedSeason:{year:Number(season),type:2},team:{id:teamId,recordSummary:input.team.recordSummary},events};
}
