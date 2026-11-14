import {estimatedEv,qualifiedQuarterTarget} from '@/lib/estimated-ev';
import {cardModelPick} from '@/lib/saved-model-pick';
/** A priced research comparison or scorer candidate is not a saved pick. */
export function rankingRowIsPick(row:any,now=Date.now()){
 if(row?.withdrawnFromBoard||row?.resultStatus==='void'||row?.archivedOriginal?.resultStatus==='void')return false;
 if(qualifiedQuarterTarget(row,now))return true;
 if(!cardModelPick(row,now))return false;
 const ev=estimatedEv(row,now);return ev.status==='available'&&ev.percent>0;
}
