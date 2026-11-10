import {isOfficialFinal} from '@/lib/history-save-policy';
import {officialFeaturedResult} from '@/lib/featured-official-result';
import {savedResearchDecisions} from '@/lib/saved-research-performance';

const paths:Record<string,string> = {
 nba:'/api/basketball/live-player-stats?sport=nba',
 cbb:'/api/basketball/live-player-stats?sport=cbb',
 nfl:'/api/football/live-player-stats?sport=nfl',
 cfb:'/api/football/live-player-stats?sport=cfb',
 nhl:'/api/nhl/live-player-stats?',
};

/** A later official FINAL may revise a player's stat after the first FINAL
 * checkpoint. Compare only exact fixture/player/market numeric observations.
 * Absence of a row or a provider response by itself is never a correction. */
export function officialFinalStatDifferences(previous:any,next:any):number{
 if(!previous||!next||String(previous.gameId)!==String(next.gameId)||
    !isOfficialFinal(previous,String(previous.gameId))||
    !isOfficialFinal(next,String(previous.gameId)))return 0;
 const original=new Map<string,any>((previous.rows||[]).filter((r:any)=>/^\d+$/.test(String(r?.playerId||''))).map((r:any)=>[String(r.playerId),r.stats]));
 let count=0;
 for(const player of next.rows||[]){
  const old=original.get(String(player?.playerId||''));
  if(!old||!player?.stats)continue;
  for(const [market,value] of Object.entries(player.stats)){
   if(typeof value==='number'&&Number.isFinite(value)&&typeof old[market]==='number'&&Number.isFinite(old[market])&&value!==old[market])count++;
  }
 }
 return count;
}

export function createWorkerGradingReplay(sport:string){
 const originals = new Map<string,any>();
 const finals = new Map<string,any>();
 return {
  consume(doc:{stream:string;payload:any}){
   if(!paths[sport]||!Array.isArray(doc.payload))return;
   if(doc.stream.startsWith('protected_final_')){
    for(const receipt of doc.payload){
     const item=receipt?.payload,game=String(item?.gameId??'');
     if(item?.kind==='official_final_checkpoint'&&item.source==='official_final_boxscore'&&isOfficialFinal(item.boxscore,game))finals.set(game,item.boxscore);
    }
   }
   if(doc.stream.startsWith('protected_pregame_')){
    for(const receipt of doc.payload){
     const item=receipt?.payload;
     if(item?.kind!=='pregame_checkpoint')continue;
     for(const row of savedResearchDecisions([{...item,capturedAt:item.checkpointAt}])){
      const previous=originals.get(row.key);
      if(!previous||Date.parse(row.savedAt)<Date.parse(previous.savedAt))originals.set(row.key,row);
     }
    }
   }
  },
  async verify(fetchRoute:(path:string)=>Promise<Response>,saveCorrections?:(finals:any[])=>Promise<void>,batchIndex=0){
   // Check every archived authenticated FINAL, not only games that happen
   // to include a qualified research pick in protected_pregame documents.
   // Immutable worker-model picks are saved separately and may be omitted
   // from that research subset; their official results must still update.
   const games = new Map<string,any[]>([...finals.keys()].map(game=>[game,[]]));
   for(const row of originals.values()){
    const game=String(row.gameId);
    if(!/^\d+$/.test(game)||!finals.has(game))continue;
    games.get(game)!.push(row);
   }
   // Rotating bounded batches inspect every finished game over successive
   // scheduled ticks. Previously the top-two-only selection permanently
   // skipped other final fixtures and their late boxscore corrections.
   const ordered=[...games].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
   const index=Number.isFinite(batchIndex)?Math.max(0,Math.floor(batchIndex)):0;
   const start=ordered.length?(index*2)%ordered.length:0;
   const candidates=Array.from({length:Math.min(2,ordered.length)},(_,i)=>ordered[(start+i)%ordered.length]);
   let checked=0,matched=0,differences=0,unavailable=0;
   const corrections=[];
   for(const [game,rows] of candidates){
    const path=paths[sport];
    const response=await fetchRoute(path+(path.endsWith('?')?'':'&')+'gameId='+game);
    const final=response.ok?await response.json():null;
    if(!isOfficialFinal(final,game)){unavailable++;continue;}
    checked++;
    const before=differences;
    for(const row of rows){
     const expected=officialFeaturedResult(row,finals.get(game)),actual=officialFeaturedResult(row,final);
     if(!expected&&!actual)continue;
     if(expected?.status===actual?.status&&expected?.actual===actual?.actual)matched++;
     else differences++;
    }
    // Original picks never change. A stat correction is a separately stored
    // verified FINAL observation, including for worker-model picks which do
    // not appear in the protected research replay subset.
    const changedOfficialStats=officialFinalStatDifferences(finals.get(game),final);
    if(changedOfficialStats>0){
     differences+=Math.max(0,changedOfficialStats-(differences-before));
     corrections.push(final);
    }
   }
   if(corrections.length&&saveCorrections)await saveCorrections(corrections);
   return {games:checked,matched,differences,unavailable};
  },
 };
}
