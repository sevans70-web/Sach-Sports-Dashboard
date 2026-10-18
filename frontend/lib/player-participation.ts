/** Official participation is evidence of playing, not of having started. */
export type PlayerParticipation={playerId:string;participationConfirmed:boolean;starterConfirmed:boolean};
const norm=(v:any)=>String(typeof v==='object'?v?.name||v?.abbreviation||v?.displayName||'':v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
function positiveTime(v:any){const s=String(v??'').trim();if(/^\d+:\d{2}$/.test(s))return s.split(':').some(x=>Number(x)>0);return s!==''&&Number.isFinite(Number(s))&&Number(s)>0}
export function espnParticipation(payload:any,sport:string):PlayerParticipation[]{
 const football=['nfl','cfb'].includes(sport),out=new Map<string,PlayerParticipation>();
 for(const team of payload?.boxscore?.players||[])for(const group of team.statistics||[]){
  const labels=(group.labels||group.keys||[]).map(norm);
  for(const row of group.athletes||[]){
   const a=row.athlete||row.player||{},id=String(a.id||row.athleteId||row.playerId||'');if(!id||row.didNotPlay===true)continue;
   const stats=row.stats||row.values||[];
   const played=labels.some((label:string,i:number)=>{
    const value=stats[i];
    if(!football)return ['min','minutes'].includes(label)&&positiveTime(value);
    if(['catt','cmpatt','completionsattempts'].includes(label)){const pair=String(value??'').match(/^\d+\s*[/\-]\s*(\d+)$/);return !!pair&&Number(pair[1])>0}
    return ['att','attempts','passingattempts','car','carries','rushingattempts','rec','receptions','tgts','targets','receivingtargets'].includes(label)&&positiveTime(value);
   });
   const prev=out.get(id);out.set(id,{playerId:id,participationConfirmed:played||prev?.participationConfirmed===true,starterConfirmed:row.starter===true||prev?.starterConfirmed===true});
  }
 }
 return [...out.values()];
}
export function nhlParticipation(payload:any):PlayerParticipation[]{
 const out:PlayerParticipation[]=[];
 for(const side of ['away','home']){
  const groups=payload?.playerByGameStats?.[side+'Team']??payload?.playerByGameStats?.[side]??{};
  for(const bucket of ['forwards','defense','goalies'])for(const row of groups[bucket]||[]){
   if(!row.playerId||row.didNotPlay===true)continue;
   out.push({playerId:String(row.playerId),participationConfirmed:positiveTime(row.toi??row.timeOnIce),starterConfirmed:false});
  }
 }
 return out;
}
/** UI labels never infer a starter or appearance from game state/stat defaults. */
export function playerAvailability(row:any){
 const state=String(row?.gameState??row?.state??'').toLowerCase(),final=['post','final'].includes(state)||row?.completed===true||row?.isFinal===true,live=['in','live'].includes(state)||row?.isLive===true;
 const played=row?.participationConfirmed===true&&(!row?.participationGameId||String(row.participationGameId)===String(row.gameId));
 const confirmed=row?.lineup_confirmed===true||row?.lineupConfirmed===true||row?.confirmed===true||row?.starterConfirmed===true||/^(confirmed|confirmed starter)$/i.test(String(row?.availability||''));
 if(played&&(live||final))return {confirmed:true,label:final?'Played':'Playing',detail:'Official game boxscore confirms participation; this does not establish starting status.'};
 if(confirmed)return {confirmed:true,label:'Confirmed',detail:'Provider confirms lineup status.'};
 return {confirmed:false,label:live||final?'Participation unconfirmed':'Lineup pending',detail:live||final?'Official participation has not been confirmed for this player.':'Starting status is still pending confirmation.'};
}
export function applyParticipationEvidence(row:any,payload:any,gameId:string){
 if(payload?.success!==true||String(payload.gameId)!==String(gameId)||String(row?.gameId||'')!==String(gameId))return row;
 const participant=(payload.participants||[]).find((p:any)=>String(p.playerId)===String(row.playerId));
 if(!participant)return row;
 return {...row,participationConfirmed:row.participationConfirmed===true||(['in','post'].includes(payload.state)&&participant.participationConfirmed===true),starterConfirmed:row.starterConfirmed===true||participant.starterConfirmed===true,participationGameId:gameId};
}
/** Keep established participation through a ranking refresh of the same fixture. */
export function retainParticipation(row:any,previous:any){
 if(!row?.gameId||String(row.gameId)!==String(previous?.participationGameId)||String(row.playerId)!==String(previous?.playerId))return row;
 return {...row,participationConfirmed:row.participationConfirmed===true||previous.participationConfirmed===true,starterConfirmed:row.starterConfirmed===true||previous.starterConfirmed===true,participationGameId:String(row.gameId)};
}
