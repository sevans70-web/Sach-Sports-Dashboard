import {nullableNumber} from '@/lib/provider-fetch';

/** Graded results mix pregame closing quotes and prices captured at game end.
 * Keep this distinction before considering any line for forecast evaluation.
 * A provider's `over`/`under` verdict is never a saved Sach pick's hit/miss. */
export function inspectOwlsResultEvidence(payload:any){
 const entries=Array.isArray(payload?.data)?payload.data:[];
 const phases:Record<string,number>={},structures:Record<string,number>={};
 const counts={entries:entries.length,confirmedEntries:0,lines:0,pregameTwoSidedOverUnder:0,archiveLines:0,unknownPhaseLines:0,unknownStructureLines:0,provisionalLines:0};
 const candidates:any[]=[];
 for(const entry of entries){
  const actual=nullableNumber(entry?.actual);
  const confirmed=entry?.final===true&&entry?.status==='ok'&&actual!==null&&!entry?.ungradableReason;
  if(confirmed)counts.confirmedEntries++;
  for(const line of Array.isArray(entry?.lines)?entry.lines:[]){
   counts.lines++;
   const phase=typeof line?.capturePhase==='string'?line.capturePhase:'unknown';
   const structure=typeof line?.marketStructure==='string'?line.marketStructure:'unknown';
   phases[phase]=(phases[phase]||0)+1;structures[structure]=(structures[structure]||0)+1;
   if(phase==='archive')counts.archiveLines++;
   if(!['archive','commence'].includes(phase))counts.unknownPhaseLines++;
   if(!['over_under','milestone','single_sided','pick_one'].includes(structure))counts.unknownStructureLines++;
   if(!confirmed)counts.provisionalLines++;
   const number=nullableNumber(line?.line),over=nullableNumber(line?.overPrice),under=nullableNumber(line?.underPrice);
   if(!confirmed||phase!=='commence'||structure!=='over_under'||line?.ungradableReason||number===null||over===null||under===null||Math.abs(over)<100||Math.abs(under)<100||!line?.book||!entry?.playerId)continue;
   counts.pregameTwoSidedOverUnder++;
   if(candidates.length<3)candidates.push({playerId:entry.playerId,playerName:entry.playerName,category:entry.category,actual,book:line.book,line:number,overPrice:over,underPrice:under,capturePhase:phase,marketStructure:structure});
  }
 }
 return {...counts,phases,structures,candidates,
  sourceTruncated:payload?.meta?.actualsTruncated===true||payload?.meta?.linesTruncated===true,
  // Phase/structure alone do not supply a timestamp, exact official fixture
  // join, main-vs-alternate identity, calibrated model, or participation rules.
  usableForValidatedForecast:false};
}
