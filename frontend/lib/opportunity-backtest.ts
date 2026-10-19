/** Retrospective point-forecast research. This module never produces GI/picks.
 * Targets and actual target-game workload are forbidden as model features. */
export type OpportunityGame={sport:string;season:string;playerId:string;playerName:string;gameId:string;gameTime:string;teamId:string;opponentId:string;market:string;actual:number;workload:number;source:string;retrievedAt:string};
const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
function numeric(v:any){if(v==null||typeof v==='boolean'||!String(v).trim())return null;const n=Number(String(v).replaceAll(',',''));return Number.isFinite(n)?n:null}
function minutes(v:any){const m=String(v??'').match(/^(\d+):(\d{2})$/);return m?Number(m[1])+Number(m[2])/60:numeric(v)}
const football:Record<string,{outcome:string[];volume:string[]}>= {
 passing_yards:{outcome:['passingyards','passyards'],volume:['passingattempts','passattempts']},
 rushing_yards:{outcome:['rushingyards','rushyards'],volume:['rushingattempts','rushattempts','carries']},
 receiving_yards:{outcome:['receivingyards','receptionyards'],volume:['receivingtargets','targets']},
 receptions:{outcome:['receptions','receivingreceptions'],volume:['receivingtargets','targets']},
};
const basketball:Record<string,string[]>={points:['points'],rebounds:['totalrebounds','rebounds'],assists:['assists'],threes_made:['threepointfieldgoalsmade','threepointfieldgoalsmadethreepointfieldgoalsattempted'],steals:['steals'],blocks:['blocks']};
export function espnOpportunityGames(payload:any,identity:{sport:string;season:string;playerId:string;playerName:string;source:string;retrievedAt:string}):OpportunityGame[]{
 const names=(payload?.names||[]).map(norm),isFootball=['nfl','cfb'].includes(identity.sport),seen=new Set<string>(),out:OpportunityGame[]=[];
 const stat=(stats:any[],aliases:string[])=>{const ix=aliases.map(k=>names.indexOf(k)).find(i=>i>=0);return ix==null?null:stats[ix]};
 for(const st of payload?.seasonTypes||[]){
  // ESPN's group 1 is preseason; it must not be mixed with regular-season data.
  if(Number(st.type)===1||/preseason/i.test(String(st.displayName||'')))continue;
  for(const c of st.categories||[])if(c.type==='event')for(const e of c.events||[]){
   const gameId=String(e.eventId||''),meta=payload.events?.[gameId],time=Date.parse(meta?.gameDate||'');
   if(!gameId||seen.has(gameId)||!Number.isFinite(time)||!['W','L','T'].includes(String(meta?.gameResult||'')))continue;seen.add(gameId);
   // Avoid in-progress/recently unfinished observations; no kickoff+N final timestamp is invented.
   if(time>=Date.parse(identity.retrievedAt)-48*3600000)continue;
   const stats=e.stats||[],teamId=String(meta.team?.id||''),opponentId=String(meta.opponent?.id||'');if(!teamId||!opponentId)continue;
   for(const [market,definition] of Object.entries(isFootball?football:basketball)){
    let actual:number|null,workload:number|null;
    if(isFootball){const d=definition as typeof football[string];actual=numeric(stat(stats,d.outcome));workload=numeric(stat(stats,d.volume))}
    else{const raw=stat(stats,definition as string[]);actual=market==='threes_made'&&/^\d+[-/]\d+$/.test(String(raw))?Number(String(raw).split(/[-/]/)[0]):numeric(raw);workload=minutes(stat(stats,['minutes']))}
    if(actual==null||workload==null||workload<0)continue;
    out.push({...identity,gameId,gameTime:new Date(time).toISOString(),teamId,opponentId,market,actual,workload});
   }
  }
 }
 return out;
}
export function nhlOpportunityGames(payload:any,identity:{sport:string;season:string;playerId:string;playerName:string;source:string;retrievedAt:string}):OpportunityGame[]{
 const out:OpportunityGame[]=[];
 for(const g of payload?.gameLog||[]){const time=Date.parse(g.gameDate||''),workload=minutes(g.toi);if(!Number.isFinite(time)||time>=Date.parse(identity.retrievedAt)-48*3600000||workload==null||workload<0)continue;
  const gameId=String(g.gameId||''),teamId=String(g.teamAbbrev||''),opponentId=String(g.opponentAbbrev||'');if(!gameId||!teamId||!opponentId)continue;
  const shotsAgainst=numeric(g.shotsAgainst),goalsAgainst=numeric(g.goalsAgainst),goalie=shotsAgainst!=null;
  const saves=numeric(g.saves)??(shotsAgainst!=null&&goalsAgainst!=null&&shotsAgainst>=goalsAgainst?shotsAgainst-goalsAgainst:null);
  const values:Record<string,number|null>=goalie?{goalie_saves:saves}:{shots_on_goal:numeric(g.shots),goals:numeric(g.goals),assists:numeric(g.assists),points:numeric(g.points)};
  for(const [market,actual] of Object.entries(values))if(actual!=null)out.push({...identity,gameId,gameTime:new Date(time).toISOString(),teamId,opponentId,market,actual,workload});
 }
 return out;
}
const avg=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
/** Require same season AND team. Availability lag is a conservative research
 * convention, not a claim that an archived pregame feature snapshot exists. */
export function opportunityFeatures(history:OpportunityGame[],target:Omit<OpportunityGame,'actual'|'workload'>,availableAt=target.gameTime){
 const cutoff=Date.parse(availableAt)-48*3600000;
 const rows=history.filter(g=>g.sport===target.sport&&g.market===target.market&&g.playerId===target.playerId&&g.season===target.season&&g.teamId===target.teamId&&Date.parse(g.gameTime)<cutoff&&Number.isFinite(g.actual)&&Number.isFinite(g.workload)).sort((a,b)=>a.gameTime.localeCompare(b.gameTime));
 if(rows.length<3)return {features:null,baseline:null,reason:'fewer_than_three_same_season_team_appearances'};
 const recent=rows.slice(-3),long=rows.slice(-8),last=rows.at(-1)!,v3=avg(recent.map(g=>g.workload)),v8=avg(long.map(g=>g.workload));
 // Eligibility depends only on PREVIOUS appearances. Low/zero target workload
 // remains an outcome in the test, including injuries or backup relief games.
 if(v3<=0||v8<=0||last.workload<v3*.4||v3<v8*.5||v3>v8*2)return {features:null,baseline:null,reason:'prior_workload_role_uncertain'};
 const rate=(games:OpportunityGame[])=>games.reduce((n,g)=>n+g.actual,0)/games.reduce((n,g)=>n+g.workload,0);
 const r3=rate(recent),r8=rate(long),volumeSd=Math.sqrt(avg(long.map(g=>(g.workload-v8)**2)));
 const features=[v3,v8,last.workload,r3,r8,v3*(r3*.5+r8*.5),avg(recent.map(g=>g.actual)),avg(long.map(g=>g.actual)),volumeSd,Math.min(30,(Date.parse(target.gameTime)-Date.parse(last.gameTime))/86400000)];
 const base=rows.slice(-10),baseline=base.reduce((n,g,i)=>n+g.actual*(i+1),0)/base.reduce((n,_,i)=>n+i+1,0);
 return {features,baseline,reason:null};
}
function ridge(rows:{x:number[];y:number}[]){
 const k=rows[0].x.length,means=Array.from({length:k},(_,i)=>avg(rows.map(r=>r.x[i]))),scales=means.map((m,i)=>Math.sqrt(avg(rows.map(r=>(r.x[i]-m)**2)))||1);
 const vector=(x:number[])=>[1,...x.map((v,i)=>(v-means[i])/scales[i])],size=k+1,A=Array.from({length:size},()=>Array(size+1).fill(0));
 for(const r of rows){const x=vector(r.x);for(let i=0;i<size;i++){for(let j=0;j<size;j++)A[i][j]+=x[i]*x[j];A[i][size]+=x[i]*r.y}}
 for(let i=1;i<size;i++)A[i][i]+=20; // fixed before looking at held-out results
 for(let i=0;i<size;i++){let pivot=i;for(let j=i+1;j<size;j++)if(Math.abs(A[j][i])>Math.abs(A[pivot][i]))pivot=j;[A[i],A[pivot]]=[A[pivot],A[i]];if(Math.abs(A[i][i])<1e-9)return null;const d=A[i][i];for(let j=i;j<=size;j++)A[i][j]/=d;for(let h=0;h<size;h++)if(h!==i){const factor=A[h][i];for(let j=i;j<=size;j++)A[h][j]-=factor*A[i][j]}}
 return (x:number[])=>vector(x).reduce((n,v,i)=>n+v*A[i][size],0);
}
export function evaluateOpportunityModels(games:OpportunityGame[]){
 const unique=new Map<string,OpportunityGame>();for(const g of games){const key=[g.sport,g.market,g.playerId,g.gameId].join('|');if(unique.has(key))throw Error('Duplicate observation '+key);unique.set(key,g)}
 const groups=new Map<string,OpportunityGame[]>();for(const g of unique.values()){const key=g.sport+'|'+g.market;groups.set(key,[...(groups.get(key)||[]),g])}
 const reports=[];
 for(const [group,rows] of groups){
  const sport=rows[0].sport,testSeason=sport==='nhl'?'20252026':'2026',train=rows.filter(g=>g.season<testSeason),test=rows.filter(g=>g.season===testSeason),reasons:Record<string,number>={};
  if(train.length&&test.length&&Math.max(...train.map(g=>Date.parse(g.gameTime)))>=Math.min(...test.map(g=>Date.parse(g.gameTime))))throw Error('Training/test dates overlap '+group);
  const histories=new Map<string,OpportunityGame[]>();for(const g of rows){const key=g.playerId+'|'+g.season+'|'+g.teamId;histories.set(key,[...(histories.get(key)||[]),g])}
  const inputs=(g:OpportunityGame[])=>g.map(row=>({row,...opportunityFeatures(histories.get(row.playerId+'|'+row.season+'|'+row.teamId)||[],row)}));
  const training=inputs(train).filter((r):r is typeof r & {features:number[]}=>r.features!=null),model=training.length>=100?ridge(training.map(r=>({x:r.features,y:r.row.actual}))):null;
  const targets=inputs(test),scored:{actual:number;prediction:number;baseline:number;workload:number}[]=[];for(const r of targets){const reason=r.reason||(!model?'insufficient_training':null);if(reason){reasons[reason]=(reasons[reason]||0)+1;continue}scored.push({actual:r.row.actual,prediction:model!(r.features!),baseline:r.baseline!,workload:r.row.workload})}
  const mae=(key:'prediction'|'baseline')=>scored.length?avg(scored.map(r=>Math.abs(r[key]-r.actual))):null;
  const modelMae=mae('prediction'),baselineMae=mae('baseline');
  reports.push({group,trainSeason:sport==='nhl'?'20242025':'2025',testSeason,trainingExamples:training.length,targetAppearances:test.length,forecasts:scored.length,coverage:test.length?scored.length/test.length:0,modelMae,baselineMae,maeImprovementPct:modelMae!=null&&baselineMae?100*(baselineMae-modelMae)/baselineMae:null,rmse:scored.length?Math.sqrt(avg(scored.map(r=>(r.prediction-r.actual)**2))):null,lowWorkloadTargetAppearances:scored.filter(r=>r.workload<3).length,abstentions:reasons});
 }
 return {modelId:'opportunity-point-candidate-v1',validatedForBetting:false,giEnabled:false,observations:unique.size,groups:reports,
  limitations:['Current ranking-board player selection introduces survivorship/selection bias.','Historical logs are current revisions, not frozen historical data vintages.','48-hour result-availability lag is a research convention; exact historical publication timestamps are unavailable.','No historical injury, depth chart, weather forecast, game script, rotation, goalie or exact-price calibration is established.','Point error comparison does not establish win probability, calibrated edge, GI, or profit.','Quarter and scorer models are not evaluated.']};
}
