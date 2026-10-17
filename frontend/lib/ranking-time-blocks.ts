export function rankingTimeBlocks<T extends {gameState?:string;raw?:any}>(cards:T[]){
  return ([['early','Noon / Early'],['afternoon','Afternoon'],['evening','Evening']] as const)
    .map(([key,label])=>{
      const rows=cards.filter(card=>card.raw?.slateKey===key);
      return {key,label,rows,completed:rows.length>0&&rows.every(card=>card.gameState==='post'||card.raw?.gameState==='post'||card.raw?.completed===true)};
    }).filter(block=>block.rows.length>0);
}
