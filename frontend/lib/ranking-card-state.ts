/** A prediction's grade/void status is not the game's clock. */
export function rankingCardState(row:any,status:string):"pregame"|"live"|"final"{
  const state=String(row?.gameState??row?.state??"").toLowerCase();
  if(state==='post'||state==='final'||row?.completed===true||row?.isFinal===true)return 'final';
  if(state==='in'||state==='live'||row?.isLive===true||row?.result_live===true)return 'live';
  if(state==='pre'||state==='scheduled')return 'pregame';
  return ['hit','miss','push','void'].includes(status)?'final':'pregame';
}
