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
  async verify(fetchRoute:(path:string)=>Promise<Response>,saveCorrections?:(finals:any[])=>Promise<void>){
   const games = new Map<string,any[]>();
   for(const row of originals.values()){
    const game=String(row.gameId);
    if(!/^\d+$/.test(game)||!finals.has(game))continue;
    const rows=games.get(game)??[];
    rows.push(row);
    games.set(game,rows);
   }
   const candidates=[...games].sort((a,b)=>b[1].length-a[1].length).slice(0,2);
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
    if(differences>before)corrections.push(final);
   }
   if(corrections.length&&saveCorrections)await saveCorrections(corrections);
   return {games:checked,matched,differences,unavailable};
  },
 };
}
