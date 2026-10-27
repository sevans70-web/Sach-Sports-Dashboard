/** Prefer the fitted forecast actually recorded before start, not the legacy
 * season baseline carried alongside it. No observed result is a projection. */
export function recordedProjectionValue(record:any):number|null{
 const f=record?.researchForecast,start=Date.parse(record?.gameTime||''),saved=Date.parse(record?.boardCapturedAt||record?.savedAt||''),calculated=Date.parse(f?.calculatedAt||'');
 if(f?.status==='available'&&typeof f.projection==='number'&&Number.isFinite(f.projection)&&Number.isFinite(saved)&&saved<start&&Number.isFinite(calculated)&&calculated<=saved&&calculated<start)return f.projection;
 const value=record?.projection??record?.modelProjection;
 return typeof value==='number'&&Number.isFinite(value)?value:null;
}
/** Display-only pregame receipt. Actuals, recent averages and post-start forecasts
 * are never fallback values for an original projection. */
export function savedProjectionEvidence(row:any,result?:any,now=Date.now()){
 const start=Date.parse(row?.gameTime||'');
 if(!Number.isFinite(start)||(!row?.boardFrozen&&start>now))return null;
 const frozen=row?.boardFrozen===true;
 const source=frozen?row:result;
 if(!source)return null;
 if(!frozen&&(!row.gameId||!row.playerId||String(source.gameId)!==String(row.gameId)||String(source.playerId)!==String(row.playerId)||source.market!==row.market||Date.parse(source.gameTime)!==start))return null;
 const savedAt=frozen?row.boardCapturedAt:source.boardCapturedAt||source.savedAt;
 const at=Date.parse(savedAt||'');if(!Number.isFinite(at)||at>=start||at>now)return null;
 const value=recordedProjectionValue(source);
 if(typeof value!=='number'||!Number.isFinite(value))return null;
 return {projection:value,modelProjection:value,savedAt,gameTime:row.gameTime,gameId:row.gameId,playerId:row.playerId,market:row.market};
}
export function savedProjectionText(record:any){
 const value=recordedProjectionValue(record);
 return value==null?'Not recorded':String(value);
}
