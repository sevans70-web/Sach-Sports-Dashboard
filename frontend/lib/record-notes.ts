export type RecordNote={code:string;text:string;source:string;checkedAt?:string;gameId?:string};
export function recordNoteFields(row:any){return Object.fromEntries(Object.entries({voidReason:row?.voidReason,voidReasonCode:row?.voidReasonCode,withdrawnFromBoard:row?.withdrawnFromBoard,recoveredAfterStart:row?.recoveredAfterStart,availabilityEvidence:row?.availabilityEvidence,injuryStatus:row?.injuryStatus,injuryDescription:row?.injuryDescription,didNotPlay:row?.didNotPlay}).filter(([,v])=>v!==undefined));}
const text=(v:any)=>typeof v==='string'?v:typeof v==='object'?String(v?.description||v?.name||v?.text||''):'';
export function voidRecordNote(row:any):RecordNote|null{
 if(row?.withdrawnFromBoard!==true&&String(row?.historicalStatus||row?.resultStatus||row?.status||'')!=='void')return null;
 if(row.voidReason)return {code:row.voidReasonCode||'recorded_void',text:String(row.voidReason),source:'Saved grading record'};
 if(row.withdrawnFromBoard)return {code:'withdrawn',text:'Removed from the ranking board before game start. This does not establish an injury or non-participation.',source:'Saved board history'};
 if(row.recoveredAfterStart)return {code:'late_capture',text:'Captured after the game started; excluded from pregame results. This is not a did-not-play designation.',source:'Saved capture history'};
 const original=row.archivedOriginal||row;
 if(original.sportsbookLine==null&&!['first_td','first_basket'].includes(row.market))return {code:'missing_line',text:'No betting line was recorded, so this entry cannot be graded against a line.',source:'Saved grading record'};
 return {code:'reason_unrecorded',text:'The original void reason was not recorded. Injury or non-participation has not been established.',source:'Saved grading record'};
}
export function playerAvailabilityNote(row:any):RecordNote|null{
 const evidence=row?.availabilityEvidence;
 if(evidence?.text&&evidence.gameId&&String(evidence.gameId)===String(row?.gameId))return evidence;
 const status=text(row?.injuryStatus||row?.injury_status||row?.injury?.status||row?.availability||row?.playerStatus);
 if(row?.didNotPlay===true||/^(dnp|did not play)$/i.test(status))return {code:'dnp_reported',text:'Did not play'+(row?.dnpReason?`: ${text(row.dnpReason)}`:''),source:'Player status feed'};
 const label=row?.inactive===true?'Inactive':row?.isOut===true?'Out':/^(out|inactive|questionable|doubtful|day.to.day|injured reserve|suspended)$/i.test(status)?status:null;
 if(!label)return null;
 const detail=text(row?.injuryDescription||row?.injury?.description);
 return {code:'availability_reported',text:`Reported ${label}${detail?` · ${detail}`:''}`,source:'Player status feed'};
}
/** Exact fixture and athlete IDs only. Missing rows are not injury/DNP evidence. */
export function officialAvailabilityRows(payload:any,sport:string,gameId:string):{playerId:string;note:RecordNote}[]{
 const id=String(sport==='nhl'?payload?.id:payload?.header?.id||'');if(id!==String(gameId))return [];
 const checkedAt=new Date().toISOString(),source=sport==='nhl'?'NHL game report':'ESPN game report',notes=new Map<string,RecordNote>();
 const add=(playerId:any,code:string,message:string)=>{if(playerId)notes.set(String(playerId),{code,text:message,source,checkedAt,gameId})};
 if(sport==='nhl'){
  for(const side of ['homeTeam','awayTeam'])for(const bucket of ['forwards','defense','goalies'])for(const row of payload?.playerByGameStats?.[side]?.[bucket]||[]){
   if(row.didNotPlay===true)add(row.playerId,'official_dnp',`Did not play${row.reason?`: ${text(row.reason)}`:''}`);
  }
 }else{
  for(const group of payload?.injuries||[])for(const injury of group?.injuries||[]){
   const status=text(injury.status),detail=text(injury.details?.type||injury.type||injury.details?.detail);
   if(status)add(injury.athlete?.id||injury.playerId,'official_injury_status',`Reported ${status}${detail&&detail.toLowerCase()!==status.toLowerCase()?` · ${detail}`:''}`);
  }
  for(const team of payload?.boxscore?.players||[])for(const group of team?.statistics||[])for(const row of group?.athletes||[]){
   const id=row.athlete?.id||row.player?.id;
   if(row.didNotPlay===true)add(id,'official_dnp',`Did not play${row.reason?`: ${text(row.reason)}`:''}`);
   else if(['nba','wnba','cbb'].includes(sport)&&row.starter===false){
    const labels=(group.labels||group.keys||[]).map((v:any)=>text(v).toLowerCase());
    const minuteIndex=labels.findIndex((v:string)=>['min','minutes'].includes(v));
    const minutes=String(row.stats?.[minuteIndex]??'');
    if(minuteIndex>=0&&/^\d+(?::\d{2})?$/.test(minutes)&&minutes.split(':').some(v=>Number(v)>0)&&!notes.has(String(id)))add(id,'bench_appearance','Did not start; appeared off the bench. Settlement depends on the market’s participation rules.');
   }
  }
 }
 return [...notes].map(([playerId,note])=>({playerId,note}));
}
export function officialRecordAvailability(row:any,payload:any,sport:string):RecordNote|null{
 const gameId=String(row?.gameId||''),playerId=String(row?.playerId||'');
 const note=officialAvailabilityRows(payload,sport,gameId).find(p=>p.playerId===playerId)?.note;if(note)return note;
 if(!voidRecordNote(row)||row.withdrawnFromBoard||row.recoveredAfterStart||!/^\d+$/.test(playerId))return null;
 const same=String(sport==='nhl'?payload?.id:payload?.header?.id||'')===gameId;
 const final=sport==='nhl'?['OFF','FINAL'].includes(payload?.gameState):payload?.header?.competitions?.[0]?.status?.type?.completed===true;
 if(!same||!final)return null;
 const records=sport==='nhl'?['homeTeam','awayTeam'].flatMap(side=>['forwards','defense','goalies'].flatMap(k=>payload?.playerByGameStats?.[side]?.[k]||[])):(payload?.boxscore?.players||[]).flatMap((t:any)=>(t.statistics||[]).flatMap((g:any)=>g.athletes||[]));
 if(!records.length||records.some((r:any)=>String(sport==='nhl'?r.playerId:r.athlete?.id||r.player?.id)===playerId))return null;
 return {code:'absent_final_stat_row',text:'The saved player ID is absent from the retrieved final statistical tables. Injury and did-not-play status are not confirmed.',source:sport==='nhl'?'NHL final boxscore':'ESPN final boxscore',gameId,checkedAt:new Date().toISOString()};
}
