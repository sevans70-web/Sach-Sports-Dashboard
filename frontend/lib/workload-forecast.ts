/** Experimental, offline workload models. Deliberately not in VALIDATED_MODELS.
 * Every observation describes exactly one player/market/period and role segment.
 * Features must be frozen before kickoff; results must be final before training.
 * No provider flag or output from this module authorizes a betting pick. */
export type ModelSport="nfl"|"cfb"|"nba"|"wnba"|"cbb"|"nhl";
export type Observation={
 id:string;playerId:string;sport:ModelSport;market:string;period:"game"|"q1";
 roleId:string;season:string;kickoff:string;featuresAt:string;finalAt:string;
 features:Record<string,number>;actual:number;line:number|null;
 quoteAt:string|null;overPrice:number|null;underPrice:number|null;
 quoteSource?:string;quoteId?:string;quotePeriod?:"game"|"q1";quoteMainLine?:boolean;quoteCapturedAt?:string;
};
export const WORKLOAD_FEATURES:Record<ModelSport,readonly string[]>={
 nfl:["expectedWorkload","efficiency","opponentEfficiency","injuryImpact","teammateAvailability","windMph","precipitation","impliedTeamTotal","spread"],
 cfb:["expectedWorkload","efficiency","opponentEfficiency","injuryImpact","teammateAvailability","windMph","precipitation","impliedTeamTotal","spread"],
 nba:["expectedMinutes","usage","rotationShare","opponentPace","opponentEfficiency","injuryImpact","teammateAvailability"],
 wnba:["expectedMinutes","usage","rotationShare","opponentPace","opponentEfficiency","injuryImpact","teammateAvailability"],
 cbb:["expectedMinutes","usage","rotationShare","opponentPace","opponentEfficiency","injuryImpact","teammateAvailability"],
 nhl:["expectedIceTime","lineAssignment","powerPlayShare","opponentEfficiency","goalieConfirmed","goalieSavePct","injuryImpact","teammateAvailability"],
};
export function observationProblem(row:Observation){
 if(!row||!row.id||!row.playerId||!row.roleId||!row.season||!WORKLOAD_FEATURES[row.sport])return "missing_identity_or_role";
 if(/first|anytime|_td|touchdown/.test(row.market))return "scorer_model_required";
 if((row.market.startsWith("q1_")?"q1":"game")!==row.period)return "wrong_period";
 const start=Date.parse(row.kickoff),at=Date.parse(row.featuresAt),final=Date.parse(row.finalAt);
 if(!Number.isFinite(start)||!Number.isFinite(at)||!Number.isFinite(final)||at>=start||final<=start)return "invalid_pregame_or_settlement_time";
 if(!Number.isFinite(row.actual))return "missing_actual";
 if(!WORKLOAD_FEATURES[row.sport].every(key=>Number.isFinite(row.features?.[key])))return "missing_context";
 if(row.sport==="nhl"&&row.features.goalieConfirmed!==1)return "unconfirmed_goalie";
 const workload=row.features.expectedWorkload??row.features.expectedMinutes??row.features.expectedIceTime;
 if(workload<=0)return "unknown_workload";
 if(row.period==="q1"&&row.features.periodSpecific!==1)return "quarter_workload_required";
 return null;
}
function compatible(a:Observation,b:Observation){return a.sport===b.sport&&a.market===b.market&&a.period===b.period&&a.season===b.season}
/** Ridge least squares with train-only normalization; no tuning on test games. */
function fit(rows:Observation[],keys:readonly string[]){
 const means=keys.map(k=>rows.reduce((n,r)=>n+r.features[k],0)/rows.length);
 const scales=keys.map((k,i)=>Math.sqrt(rows.reduce((n,r)=>n+(r.features[k]-means[i])**2,0)/rows.length)||1);
 const vector=(r:Observation)=>[1,...keys.map((k,i)=>(r.features[k]-means[i])/scales[i])];
 const size=keys.length+1,A=Array.from({length:size},()=>Array(size+1).fill(0));
 for(const r of rows){const x=vector(r);for(let i=0;i<size;i++){for(let j=0;j<size;j++)A[i][j]+=x[i]*x[j];A[i][size]+=x[i]*r.actual}}
 for(let i=1;i<size;i++)A[i][i]+=10; // fixed regularization, declared before testing
 for(let i=0;i<size;i++){
  let pivot=i;for(let j=i+1;j<size;j++)if(Math.abs(A[j][i])>Math.abs(A[pivot][i]))pivot=j;
  [A[i],A[pivot]]=[A[pivot],A[i]];
  if(Math.abs(A[i][i])<1e-9)return null;
  const divisor=A[i][i];for(let j=i;j<=size;j++)A[i][j]/=divisor;
  for(let k=0;k<size;k++){if(k===i)continue;const factor=A[k][i];for(let j=i;j<=size;j++)A[k][j]-=factor*A[i][j]}
 }
 const beta=A.map(r=>r[size]);return (r:Observation)=>Math.max(0,vector(r).reduce((n,v,i)=>n+v*beta[i],0));
}
export function candidateForecast(training:Observation[],target:Observation){
 const issue=observationProblem(target);if(issue)return {projection:null,reason:issue,trainingRows:0};
 const start=Date.parse(target.kickoff);
 const eligible=training.filter(r=>r.id!==target.id&&!observationProblem(r)&&compatible(r,target)&&Date.parse(r.finalAt)<Date.parse(target.featuresAt)&&Date.parse(r.kickoff)<start);
 const unique=[...new Map(eligible.map(r=>[r.id,r])).values()];
 // Require recent observations in the CURRENT role; a backup's old starts cannot
 // establish a new starting assignment. Role IDs must come from dated inputs.
 const role=unique.filter(r=>r.playerId===target.playerId&&r.roleId===target.roleId);
 if(role.length<3)return {projection:null,reason:"insufficient_current_role",trainingRows:unique.length};
 if(unique.length<100)return {projection:null,reason:"insufficient_training",trainingRows:unique.length};
 const predict=fit(unique,WORKLOAD_FEATURES[target.sport]);
 return {projection:predict?.(target)??null,reason:predict?null:"singular_fit",trainingRows:unique.length};
}
export function walkForwardBacktest(input:Observation[]){
 const rows=[...input].sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
 const ids=new Set<string>();for(const r of rows){if(ids.has(r.id))throw new Error(`Duplicate observation ${r.id}`);ids.add(r.id)}
 const forecasts=rows.map(row=>({row,...candidateForecast(rows,row)}));
 const scored=forecasts.filter((r):r is typeof r & {projection:number}=>r.projection!=null);
 const groups=new Map<string,typeof scored>();
 for(const r of scored){const k=[r.row.sport,r.row.market,r.row.period,r.row.season].join("|");groups.set(k,[...(groups.get(k)||[]),r])}
 const reports=[...groups].map(([group,items])=>{
  const mae=items.reduce((n,r)=>n+Math.abs(r.projection-r.row.actual),0)/items.length;
  const rmse=Math.sqrt(items.reduce((n,r)=>n+(r.projection-r.row.actual)**2,0)/items.length);
  const lines=items.filter(({row:r})=>Boolean(r.quoteSource&&r.quoteId)&&r.quoteMainLine===true&&r.quotePeriod===r.period&&Number.isFinite(Date.parse(r.quoteCapturedAt||""))&&Date.parse(r.quoteCapturedAt!)<=Date.parse(r.featuresAt)&&Date.parse(r.quoteCapturedAt!)>=Date.parse(r.quoteAt||"")&&r.line!=null&&Number.isFinite(r.line)&&r.quoteAt!=null&&Date.parse(r.quoteAt)<Date.parse(r.featuresAt)&&Date.parse(r.featuresAt)-Date.parse(r.quoteAt)<=15*60_000&&r.overPrice!=null&&r.underPrice!=null&&Math.abs(r.overPrice)>=100&&Math.abs(r.underPrice)>=100);
  const nonPush=lines.filter(r=>r.row.actual!==r.row.line&&r.projection!==r.row.line);
  const wins=nonPush.filter(r=>(r.projection>r.row.line!)===(r.row.actual>r.row.line!));
  const profit=nonPush.reduce((n,r)=>{const p=r.projection>r.row.line!?r.row.overPrice!:r.row.underPrice!;const hit=(r.projection>r.row.line!)===(r.row.actual>r.row.line!);return n+(hit?(p>0?p/100:100/-p):-1)},0);
  return {group,samples:items.length,mae,rmse,exactQuoteSamples:lines.length,settled:nonPush.length,wins:wins.length,roi:nonPush.length?profit/nonPush.length:null};
 });
 const abstentions:Record<string,number>={};for(const r of forecasts)if(r.reason)abstentions[r.reason]=(abstentions[r.reason]||0)+1;
 return {modelId:"workload-ridge-candidate-v1",validated:false,promotionAllowed:false,
  notice:"Experimental walk-forward point forecasts only. No calibrated probability, GI, or betting approval. Reports do not register a model.",
  observations:rows.length,forecasts:scored.length,coverage:rows.length?scored.length/rows.length:0,abstentions,groups:reports};
}
