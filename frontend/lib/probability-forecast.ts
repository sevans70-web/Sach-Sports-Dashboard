import {opportunityFeatures, type OpportunityGame} from '@/lib/opportunity-backtest';
import {basketballFeatureIndex} from '@/lib/basketball-model-inputs';

/** Research engine. These artifacts are deliberately independent of the live
 * model registry. Fitting, calibration and price evaluation never certify GI. */
export type LinearModel={means:number[];scales:number[];coefficients:number[]};
export type DistributionModel={version:1;group:string;trainedThrough:string;calibratedThrough:string;
 workload:LinearModel;rate:LinearModel;direct?:LinearModel;residuals:number[];trainingRows:number;calibrationRows:number;
 rateTrainingRows?:number;
 workloadCalibration?:{expectedWorkload:number;residual:number}[];
 featurePolicy?:'basketball_context';
 calibrationSamples?:number;
 minimum:number|null;integer:boolean;validatedForBetting:false};
export type ExactQuote={sport:string;market:string;period:'game'|'q1';gameId:string;playerId:string;
 bookmaker:string;quoteId:string;line:number;overPrice:number;underPrice:number;
 updatedAt:string;capturedAt:string;decisionAt:string;mainLine:boolean};
type FeatureRow={game:OpportunityGame;x:number[];baseline:number};
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const validTime=(s:string)=>Number.isFinite(Date.parse(s));
const groupOf=(g:OpportunityGame)=>g.sport+'|'+g.market;
const outcomeKey=(g:OpportunityGame)=>[g.sport,g.market,g.playerId,g.gameId].join('|');
const supported=(g:Pick<OpportunityGame,'sport'|'market'>)=>
 ['nfl','cfb'].includes(g.sport)?['passing_yards','rushing_yards','receiving_yards','receptions','q1_passing_yards','q1_rushing_yards','q1_receiving_yards'].includes(g.market):
 ['nba','wnba','cbb'].includes(g.sport)?['points','rebounds','assists','threes_made','steals','blocks'].includes(g.market):
 g.sport==='nhl'&&['shots_on_goal','goals','assists','points','goalie_saves'].includes(g.market);

export function probabilityInputs(history:OpportunityGame[],target:Omit<OpportunityGame,'actual'|'workload'>,availableAt=target.gameTime){
 if(!supported(target))return {features:null,baseline:null,reason:'unsupported_market'};
 let eligible=history;
 if(['nfl','cfb'].includes(target.sport)&&['passing_yards','q1_passing_yards'].includes(target.market)){
  const prior=history.filter(g=>g.sport===target.sport&&g.market===target.market&&g.playerId===target.playerId&&g.teamId===target.teamId&&g.season===target.season&&Date.parse(g.gameTime)<Date.parse(availableAt)-48*3600000).sort((a,b)=>a.gameTime.localeCompare(b.gameTime));
  const role=(g:OpportunityGame)=>target.market.startsWith('q1_')?g.roleWorkload:g.workload;
  const latestRole=prior.at(-1)?role(prior.at(-1)!):null;
  if(prior.length&&(latestRole==null||latestRole<10))return {features:null,baseline:null,reason:'latest_passing_role_uncertain'};
  // Two-attempt backup appearances cannot depress a starter's yardage mean.
  eligible=history.filter(g=>{const volume=role(g);return volume!=null&&volume>=10});
 }
 return opportunityFeatures(eligible,target,availableAt);
}

/** Fixed ridge penalty; normalization uses only these fitting rows. */
export function fitLinear(rows:{x:number[];y:number}[]):LinearModel|null{
 if(!rows.length)return null;
 const k=rows[0].x.length;
 if(rows.some(r=>r.x.length!==k||!Number.isFinite(r.y)||!r.x.every(Number.isFinite)))throw Error('Nonfinite fitting input');
 const means=Array.from({length:k},(_,i)=>mean(rows.map(r=>r.x[i])));
 const scales=means.map((m,i)=>Math.sqrt(mean(rows.map(r=>(r.x[i]-m)**2)))||1);
 const size=k+1,A=Array.from({length:size},()=>Array(size+1).fill(0));
 for(const r of rows){const x=[1,...r.x.map((v,i)=>(v-means[i])/scales[i])];for(let i=0;i<size;i++){
  for(let j=0;j<size;j++)A[i][j]+=x[i]*x[j];A[i][size]+=x[i]*r.y;
 }}
 for(let i=1;i<size;i++)A[i][i]+=20;
 for(let i=0;i<size;i++){
  let p=i;for(let j=i+1;j<size;j++)if(Math.abs(A[j][i])>Math.abs(A[p][i]))p=j;
  [A[p],A[i]]=[A[i],A[p]];const d=A[i][i];if(Math.abs(d)<1e-9)return null;
  for(let j=i;j<=size;j++)A[i][j]/=d;
  for(let h=0;h<size;h++)if(h!==i){const f=A[h][i];for(let j=i;j<=size;j++)A[h][j]-=f*A[i][j]}
 }
 return {means,scales,coefficients:A.map(row=>row[size])};
}
export function predictLinear(model:LinearModel,x:number[]){
 if(x.length!==model.means.length||!x.every(Number.isFinite))throw Error('Invalid prediction features');
 return model.coefficients[0]+x.reduce((n,v,i)=>n+(v-model.means[i])/model.scales[i]*model.coefficients[i+1],0);
}
function point(model:Pick<DistributionModel,'workload'|'rate'|'minimum'|'direct'>,x:number[]){
 const expectedWorkload=Math.max(0,predictLinear(model.workload,x));
 const expectedRate=predictLinear(model.rate,x);
 const raw=model.direct?predictLinear(model.direct,x):expectedWorkload*expectedRate;
 return {expectedWorkload,expectedRate,projection:model.minimum==null?raw:Math.max(model.minimum,raw)};
}
function materialize(games:OpportunityGame[],featurePolicy?:'basketball_context'):FeatureRow[]{
 if(featurePolicy==='basketball_context'){
  const input=basketballFeatureIndex(games);
  return games.flatMap(game=>{const prior=input(game);return prior.features?[{game,x:prior.features,baseline:prior.baseline!}]:[]});
 }
 const histories=new Map<string,OpportunityGame[]>();
 for(const g of games){const k=[g.sport,g.market,g.playerId,g.teamId,g.season].join('|');histories.set(k,[...(histories.get(k)||[]),g])}
 return games.flatMap(game=>{
  const prior=probabilityInputs(histories.get([game.sport,game.market,game.playerId,game.teamId,game.season].join('|'))||[],game);
  return prior.features? [{game,x:prior.features,baseline:prior.baseline!}]:[];
 });
}
/** Additive empirical forecast errors from a later, disjoint calibration set.
 * No Normal/Poisson assumption and no Bernoulli probability from a point mean. */
export function distributionValues(model:DistributionModel,projection:number){
 if(!Number.isFinite(projection)||!model.residuals.length)throw Error('Missing calibrated distribution');
 return model.residuals.map(e=>{
  const raw=projection+e,v=model.minimum==null?raw:Math.max(model.minimum,raw);
  return model.integer?Math.round(v):v;
 }).sort((a,b)=>a-b);
}
/** Separate experimental calibration policy, fixed before evaluation: use the
 * nearest half of calibration workloads, at least 100 observations. Selection
 * never reads the target outcome, realized workload, line or bookmaker price.
 * Sparse calibration abstains instead of silently reverting to pooled errors. */
export function workloadDistributionValues(model:DistributionModel,projection:number,expectedWorkload:number){
 const rows=model.workloadCalibration;
 if(!rows)return distributionValues(model,projection);
 if(!Number.isFinite(expectedWorkload)||expectedWorkload<0||rows.length<200||rows.some(r=>!Number.isFinite(r.expectedWorkload)||r.expectedWorkload<0||!Number.isFinite(r.residual)))throw Error('Invalid workload calibration');
 const count=Math.max(100,Math.ceil(rows.length/2));
 const selected=rows.map((r,index)=>({...r,index,distance:Math.abs(r.expectedWorkload-expectedWorkload)}))
  .sort((a,b)=>a.distance-b.distance||a.index-b.index).slice(0,count);
 return distributionValues({...model,residuals:selected.map(r=>r.residual)},projection);
}
export function outcomeProbabilities(values:number[],line:number){
 if(!values.length||!Number.isFinite(line)||!values.every(Number.isFinite))throw Error('Invalid outcome distribution');
 let over=0,under=0,push=0;
 for(const v of values){if(v>line)over++;else if(v<line)under++;else push++}
 return {over:over/values.length,under:under/values.length,push:push/values.length};
}
export function empiricalCrps(values:number[],actual:number){
 if(!values.length||!Number.isFinite(actual)||!values.every(Number.isFinite))throw Error('Invalid CRPS input');
 const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
 // 0.5 E|X-X'|, computed without an O(n^2) pair matrix.
 const spread=sorted.reduce((sum,v,i)=>sum+(2*i-n+1)*v,0)/(n*n);
 return mean(sorted.map(v=>Math.abs(v-actual)))-spread;
}
/** Resample whole fixtures, preserving correlation among their player rows.
 * Diagnostic percentile interval, not evidence against missing-data bias. */
export function clusteredMeanInterval(rows:{gameId:string;value:number}[]){
 const groups=new Map<string,number[]>();for(const r of rows){
  if(!r.gameId||!Number.isFinite(r.value))throw Error('Invalid cluster input');
  groups.set(r.gameId,[...(groups.get(r.gameId)||[]),r.value]);
 }
 const clusters=[...groups.values()].map(xs=>({sum:xs.reduce((a,b)=>a+b,0),n:xs.length}));
 if(clusters.length<10)return null;
 let state=20261019;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296};
 const samples=Array.from({length:1000},()=>{
  let sum=0,n=0;for(let i=0;i<clusters.length;i++){const c=clusters[Math.floor(random()*clusters.length)];sum+=c.sum;n+=c.n}return sum/n;
 }).sort((a,b)=>a-b);
 return {clusters:clusters.length,replicates:1000,lower95:samples[24],upper95:samples[974]};
}
export function quoteProblem(q:ExactQuote,g:Pick<OpportunityGame,'sport'|'market'|'gameId'|'playerId'|'gameTime'>){
 if(q.sport!==g.sport||q.market!==g.market||q.gameId!==g.gameId||q.playerId!==g.playerId)return 'wrong_identity';
 if(q.period!==(g.market.startsWith('q1_')?'q1':'game'))return 'wrong_period';
 if(!q.bookmaker||!q.quoteId||q.mainLine!==true)return 'missing_book_or_main_line';
 if(!Number.isFinite(q.line)||!Number.isFinite(q.overPrice)||!Number.isFinite(q.underPrice)||Math.abs(q.overPrice)<100||Math.abs(q.underPrice)<100)return 'invalid_line_or_prices';
 if(![q.updatedAt,q.capturedAt,q.decisionAt,g.gameTime].every(validTime))return 'invalid_time';
 const update=Date.parse(q.updatedAt),capture=Date.parse(q.capturedAt),decision=Date.parse(q.decisionAt),start=Date.parse(g.gameTime);
 if(update>capture||capture>decision||decision>=start||decision-update>15*60_000)return 'not_fresh_frozen_pregame_quote';
 return null;
}
function payout(price:number){return price>0?price/100:100/-price}
export function evaluatePrice(values:number[],q:ExactQuote){
 const p=outcomeProbabilities(values,q.line);
 const overEv=p.over*payout(q.overPrice)-p.under,underEv=p.under*payout(q.underPrice)-p.over;
 const side=overEv>=underEv?'OVER':'UNDER',win=side==='OVER'?p.over:p.under,ev=Math.max(overEv,underEv);
 const conditional=1-p.push>0?win/(1-p.push):null;
 const impliedOver=1/(1+payout(q.overPrice)),impliedUnder=1/(1+payout(q.underPrice));
 // Research-only fixed policy, declared before this evaluation. No tuning
 // against test outcomes and no live GI or recommendation is emitted.
 return {...p,overEv,underEv,marketOver:impliedOver/(impliedOver+impliedUnder),
  candidateSide:conditional!=null&&conditional>=.55&&ev>=.03?side:null,conditionalWinProbability:conditional};
}
export function forecastDistribution(model:DistributionModel,history:OpportunityGame[],target:Omit<OpportunityGame,'actual'|'workload'>,availableAt=target.gameTime,preparedBasketball?:ReturnType<typeof basketballFeatureIndex>){
 if(model.group!==groupOf(target as OpportunityGame))return {reason:'wrong_group' as string,forecast:null};
 // Features are reconstructed with a 48-hour result lag. This is not a
 // substitute for a frozen pregame role/injury/rotation snapshot.
 if(!validTime(availableAt)||Date.parse(availableAt)>Date.parse(target.gameTime)||Date.parse(availableAt)-48*3600000<=Date.parse(model.calibratedThrough))return {reason:'model_not_available_before_target',forecast:null};
 const input=model.featurePolicy==='basketball_context'?(preparedBasketball||basketballFeatureIndex(history))(target,availableAt):probabilityInputs(history,target,availableAt);
 if(!input.features)return {reason:input.reason,forecast:null};
 const prediction=point(model,input.features);
 return {reason:null,forecast:{...prediction,inputFeatures:[...input.features],values:workloadDistributionValues(model,prediction.projection,prediction.expectedWorkload)}};
}
/** Fixed 65%/35% chronological split of PRIOR-season feature dates for fitting
 * and calibration; later season retained for diagnostic evaluation. The later
 * season has already been inspected for v1, so it is NOT a fresh holdout. */
export function evaluateProbabilityModels(games:OpportunityGame[],quotes:ExactQuote[]=[],options:{calibration?:'pooled'|'workload';featurePolicy?:'basketball_context';pointPolicy?:'direct';participation?:'played'}={}){
 if(options.pointPolicy!=null&&options.pointPolicy!=='direct')throw Error('Unsupported point policy');
 if(options.calibration!=null&&!['pooled','workload'].includes(options.calibration))throw Error('Unsupported calibration policy');
 if(options.participation!=null&&options.participation!=='played')throw Error('Unsupported participation policy');
 const conditional=options.calibration==='workload';
 const seen=new Set<string>();for(const g of games){
  if(seen.has(outcomeKey(g)))throw Error('Duplicate observation '+outcomeKey(g));seen.add(outcomeKey(g));
  if(!validTime(g.gameTime)||!Number.isFinite(g.actual)||!Number.isFinite(g.workload)||g.workload<0)throw Error('Invalid observation '+outcomeKey(g));
 }
 if(options.featurePolicy!=null&&options.featurePolicy!=='basketball_context')throw Error('Unsupported feature policy');
 // Research-only fitting condition. Keep the full census for lagged role features.
 const all=materialize(games,options.featurePolicy).filter(r=>options.participation!=='played'||r.game.workload>0),groups=[...new Set(games.map(groupOf))].sort(),models:DistributionModel[]=[],reports=[];
 const quoteMap=new Map<string,ExactQuote>();for(const q of quotes){const key=[q.sport,q.market,q.playerId,q.gameId].join('|');if(quoteMap.has(key))throw Error('Multiple selected quotes '+key);quoteMap.set(key,q)}
 for(const group of groups){
  const [sport,market]=group.split('|'),testSeason=sport==='nhl'?'20252026':'2026';
  const source=games.filter(g=>groupOf(g)===group),rows=all.filter(r=>groupOf(r.game)===group);
  const prior=rows.filter(r=>r.game.season<testSeason).sort((a,b)=>a.game.gameTime.localeCompare(b.game.gameTime));
  const test=rows.filter(r=>r.game.season===testSeason),dates=[...new Set(prior.map(r=>r.game.gameTime))].sort();
  const boundary=dates[Math.floor(dates.length*.65)],boundaryMs=Date.parse(boundary||'');
  // Whole timestamps stay together; 48h embargo prevents a fitting result
  // from being unavailable at the earliest calibration prediction.
  const train=prior.filter(r=>Date.parse(r.game.gameTime)<boundaryMs-48*3600000&&(options.featurePolicy||market.startsWith('q1_')||r.game.workload>0));
  const rateTraining=train.filter(r=>r.game.workload>0);
  const calibration=prior.filter(r=>Date.parse(r.game.gameTime)>=boundaryMs);
  const base={group,targetAppearances:source.filter(g=>g.season===testSeason).length,eligibleTargets:test.length,
   ...(options.featurePolicy?{zeroWorkloadTrainingRows:train.filter(r=>r.game.workload===0).length,zeroWorkloadTargets:test.filter(r=>r.game.workload===0).length}:{}),
   trainingRows:train.length,calibrationRows:calibration.length,exactQuoteSamples:0,validatedForBetting:false};
  if(train.length<100||rateTraining.length<100||calibration.length<(conditional?200:100)){reports.push({...base,reason:'insufficient_training_or_calibration',forecasts:0});continue}
  const trainedThrough=train.at(-1)!.game.gameTime,calibratedThrough=calibration.at(-1)!.game.gameTime;
  if(test.some(r=>Date.parse(r.game.gameTime)-48*3600000<=Date.parse(calibratedThrough)))throw Error('Calibration/test overlap '+group);
  // Genuine zero-opportunity quarters train the workload model. Efficiency
  // fitting alone omits them because actual/zero is undefined. Full-game v2
  // retains its previously fixed positive-workload fitting protocol.
  const workload=fitLinear(train.map(r=>({x:r.x,y:r.game.workload}))),rate=fitLinear(rateTraining.map(r=>({x:r.x,y:r.game.actual/r.game.workload})));
  if(!workload||!rate){reports.push({...base,reason:'singular_fit',forecasts:0});continue}
  const minimum=['passing_yards','rushing_yards','receiving_yards'].includes(market.replace(/^q1_/,''))?null:0;
  const model:DistributionModel={version:1,group,trainedThrough,calibratedThrough,workload,rate,
   residuals:[],trainingRows:train.length,calibrationRows:calibration.length,minimum,integer:true,validatedForBetting:false};
  if(options.featurePolicy)model.featurePolicy=options.featurePolicy;
  if(options.pointPolicy==='direct'){const direct=fitLinear(train.map(r=>({x:r.x,y:r.game.actual})));if(!direct)throw Error('Direct fit failed');model.direct=direct;}
  if(market.startsWith('q1_'))model.rateTrainingRows=rateTraining.length;
  // This separate basketball candidate fixes a maximum 401 chronological,
  // uniformly spaced calibration observations before inspecting outcomes.
  // Bounded distributions make full-population evaluation reproducible.
  const distributionCalibration=options.featurePolicy?Array.from({length:Math.min(401,calibration.length)},(_,i)=>calibration[Math.round(i*(calibration.length-1)/(Math.min(401,calibration.length)-1))]):calibration;
  if(options.featurePolicy)model.calibrationSamples=distributionCalibration.length;
  model.residuals=distributionCalibration.map(r=>r.game.actual-point(model,r.x).projection).sort((a,b)=>a-b);models.push(model);
  if(conditional)model.workloadCalibration=distributionCalibration.map(r=>{const p=point(model,r.x);return {expectedWorkload:p.expectedWorkload,residual:r.game.actual-p.projection}});
  const baselineResiduals=distributionCalibration.map(r=>r.game.actual-r.baseline).sort((a,b)=>a-b);
  const results=test.map(r=>{
   const pred=point(model,r.x),values=workloadDistributionValues(model,pred.projection,pred.expectedWorkload),n=values.length;
   // Finite-sample central 80% empirical residual interval. Dependent games
   // and conditional role changes preclude claiming a coverage guarantee.
   const lower=values[Math.max(0,Math.floor((n+1)*.1)-1)],upper=values[Math.min(n-1,Math.ceil((n+1)*.9)-1)];
   const q=quoteMap.get(outcomeKey(r.game));let quoteIssue=q?quoteProblem(q,r.game):'missing_quote';
   // Rebuild prior-only features at the actual archived decision time rather
   // than borrowing information available later, closer to kickoff.
   const quotedForecast=q&&!quoteIssue?forecastDistribution(model,source,r.game,q.decisionAt):null;
   if(quotedForecast?.reason)quoteIssue=quotedForecast.reason;
   const price=q&&!quoteIssue&&quotedForecast?.forecast?evaluatePrice(quotedForecast.forecast.values,q):null;
   const probability=price&&price.over+price.under>0?price.over/(price.over+price.under):null;
   const pooledPrice=conditional&&q&&!quoteIssue&&quotedForecast?.forecast?evaluatePrice(distributionValues(model,quotedForecast.forecast.projection),q):null;
   const pooledProbability=pooledPrice&&pooledPrice.over+pooledPrice.under>0?pooledPrice.over/(pooledPrice.over+pooledPrice.under):null;
   const decided=q&&r.game.actual!==q.line,won=price?.candidateSide&&decided?(price.candidateSide==='OVER'?r.game.actual>q!.line:r.game.actual<q!.line):null;
   const profit=!price?.candidateSide||!q?null:r.game.actual===q.line?0:won?payout(price.candidateSide==='OVER'?q.overPrice:q.underPrice):-1;
   return {gameId:r.game.gameId,actual:r.game.actual,projection:pred.projection,workload:pred.expectedWorkload,baseline:r.baseline,
    workloadError:Math.abs(pred.expectedWorkload-r.game.workload),crps:empiricalCrps(values,r.game.actual),
    pooledCrps:conditional?empiricalCrps(distributionValues(model,pred.projection),r.game.actual):null,
    pooledBrier:pooledProbability!=null&&decided?(pooledProbability-Number(r.game.actual>q!.line))**2:null,
    baselineCrps:empiricalCrps(distributionValues({...model,residuals:baselineResiduals},r.baseline),r.game.actual),
    covered:r.game.actual>=lower&&r.game.actual<=upper,width:upper-lower,quoteIssue,
    brier:probability!=null&&decided?(probability-Number(r.game.actual>q!.line))**2:null,
    marketBrier:price&&decided?(price.marketOver-Number(r.game.actual>q!.line))**2:null,
    probability,outcome:q&&decided?Number(r.game.actual>q.line):null,profit,candidateSide:price?.candidateSide||null,
    marketFavoredSide:price?(Math.abs(price.marketOver-.5)<1e-9?null:price.marketOver>.5?'OVER':'UNDER'):null,
    candidateConfidence:price?.candidateSide?(price.candidateSide==='OVER'?price.over:price.under)/(1-price.push):null,
    push:price!=null&&q?.line===r.game.actual,candidate:price?.candidateSide!=null};
  });
  const metric=(key:'brier'|'marketBrier'|'profit')=>{const xs=results.map(r=>r[key]).filter((v):v is number=>v!=null);return xs.length?mean(xs):null};
  const candidates=results.filter(r=>r.candidate&&r.profit!=null);
  const candidateDirections=Object.fromEntries((['OVER','UNDER'] as const).map(side=>{
   const calls=candidates.filter(r=>r.candidateSide===side);
   const wins=calls.filter(r=>(r.profit??0)>0).length,losses=calls.filter(r=>(r.profit??0)<0).length,pushes=calls.filter(r=>r.profit===0).length;
   return [side,{settled:calls.length,wins,losses,pushes,hitRate:wins+losses?wins/(wins+losses):null,roi:calls.length?mean(calls.map(r=>r.profit!)):null}];
  }));
  const directionalCalibration=Object.fromEntries((['OVER','UNDER'] as const).map(side=>{
   const eligible=candidates.filter(r=>r.candidateSide===side&&r.profit!==0&&r.candidateConfidence!=null&&Number.isFinite(r.candidateConfidence));
   const describe=(items:typeof eligible)=>({count:items.length,averageConfidence:items.length?mean(items.map(r=>r.candidateConfidence!)):null,
    hitRate:items.length?mean(items.map(r=>Number(r.profit!>0))):null,
    confidenceGap:items.length?mean(items.map(r=>r.candidateConfidence!-Number(r.profit!>0))):null,
    brier:items.length?mean(items.map(r=>(r.candidateConfidence!-Number(r.profit!>0))**2)):null});
   return [side,{all:describe(eligible),confidence80Plus:describe(eligible.filter(r=>r.candidateConfidence!>=.8))}];
  }));
  // Paired directional benchmark on the identical quoted decisions.
  // Market-favored direction is a diagnostic, not an actionable betting strategy.
  const marketDirectionComparison=(()=>{
   const paired=candidates.filter(r=>r.profit!==0&&r.marketFavoredSide!=null);
   const disagreements=paired.filter(r=>r.marketFavoredSide!==r.candidateSide);
   const candidateHits=paired.filter(r=>r.profit!>0).length;
   const marketHits=paired.filter(r=>r.marketFavoredSide===(r.outcome===1?'OVER':'UNDER')).length;
   return {paired:paired.length,disagreements:disagreements.length,disagreementCandidateHits:disagreements.filter(r=>r.profit!>0).length,disagreementMarketHits:disagreements.filter(r=>r.marketFavoredSide===(r.outcome===1?'OVER':'UNDER')).length,candidateHits,marketFavoredHits:marketHits,
    candidateHitRate:paired.length?candidateHits/paired.length:null,
    marketFavoredHitRate:paired.length?marketHits/paired.length:null,
    pairedFixtureInterval:clusteredMeanInterval(paired.map(r=>({gameId:r.gameId,value:Number(r.profit!>0)-Number(r.marketFavoredSide===(r.outcome===1?'OVER':'UNDER'))}))),
    distinctFixtures:new Set(paired.map(r=>r.gameId)).size,
    disagreementFixtures:new Set(disagreements.map(r=>r.gameId)).size,
    disagreementPairedInterval:clusteredMeanInterval(disagreements.map(r=>({gameId:r.gameId,value:Number(r.profit!>0)-Number(r.marketFavoredSide===(r.outcome===1?'OVER':'UNDER'))})))};
  })();
  const confidence80=candidates.filter(r=>r.candidateConfidence!=null&&r.candidateConfidence>=.8);
  const quoteRejections:Record<string,number>={};for(const r of results)if(r.quoteIssue)quoteRejections[r.quoteIssue]=(quoteRejections[r.quoteIssue]||0)+1;
  const bins=Array.from({length:10},(_,i)=>{
   const items=results.filter(r=>r.probability!=null&&r.outcome!=null&&Math.min(9,Math.floor(r.probability*10))===i);
   return {from:i/10,to:(i+1)/10,count:items.length,predicted:items.length?mean(items.map(r=>r.probability!)):null,observed:items.length?mean(items.map(r=>r.outcome!)):null};
  });
  reports.push({...base,reason:null,trainedThrough,calibrationStartsAt:calibration[0].game.gameTime,calibratedThrough,
   forecasts:results.length,mae:results.length?mean(results.map(r=>Math.abs(r.projection-r.actual))):null,
   baselineMae:results.length?mean(results.map(r=>Math.abs(r.baseline-r.actual))):null,
   workloadMae:results.length?mean(results.map(r=>r.workloadError)):null,
   crps:results.length?mean(results.map(r=>r.crps)):null,interval80Coverage:results.length?mean(results.map(r=>Number(r.covered))):null,
   baselineCrps:results.length?mean(results.map(r=>r.baselineCrps)):null,
   pairedCrpsImprovement:clusteredMeanInterval(results.map(r=>({gameId:r.gameId,value:r.baselineCrps-r.crps}))),
   ...(conditional?{calibrationPolicy:'nearest_half_workload_minimum_100',
    pairedPooledCrpsImprovement:clusteredMeanInterval(results.filter(r=>r.pooledCrps!=null).map(r=>({gameId:r.gameId,value:r.pooledCrps!-r.crps}))),
    pairedPooledBrierImprovement:clusteredMeanInterval(results.filter(r=>r.pooledBrier!=null&&r.brier!=null).map(r=>({gameId:r.gameId,value:r.pooledBrier!-r.brier!})))}:{}),
   meanIntervalWidth:results.length?mean(results.map(r=>r.width)):null,exactQuoteSamples:results.filter(r=>!r.quoteIssue).length,
   brier:metric('brier'),marketBrier:metric('marketBrier'),candidateBets:results.filter(r=>r.candidate).length,
   pairedBrierImprovement:clusteredMeanInterval(results.filter(r=>r.brier!=null&&r.marketBrier!=null).map(r=>({gameId:r.gameId,value:r.marketBrier!-r.brier!}))),
   candidateDirections,directionalCalibration,marketDirectionComparison,candidateSettled:results.filter(r=>r.profit!=null).length,candidatePushes:results.filter(r=>r.candidate&&r.push).length,
   candidateRoi:metric('profit'),candidateRoiInterval:clusteredMeanInterval(results.filter(r=>r.profit!=null).map(r=>({gameId:r.gameId,value:r.profit!}))),quoteRejections,calibrationBins:bins});
 }
 const quarter=groups.some(g=>g.split('|')[1].startsWith('q1_'));
 return {modelId:options.pointPolicy==='direct'?'direct-yardage-distribution-candidate-v1':options.featurePolicy?'basketball-context-distribution-candidate-v1':conditional?'local-workload-distribution-candidate-v1':quarter?'quarter-workload-distribution-candidate-v1':'workload-distribution-candidate-v2',validatedForBetting:false,giEnabled:false,
  observations:games.length,models,reports,limitations:options.featurePolicy?[
   'Two completed regular-season fixture windows replace current-board selection; athletes absent from final tables and incomplete boxes remain uncovered.',
   'Later-season development evaluation is not a prospective untouched holdout; official sources are current revisions.',
   'Historical source publication timestamps and frozen pregame injury/lineup reports are unavailable; features use a conservative 48-hour lag.',
   'Usage and pace are boxscore estimates with fixed 0.44 free-throw weighting, not reported official possession counts.',
   'Minutes and per-minute production are fitted separately from prior roles, workload, usage, team/opponent context, rest and home status.',
   'The uncertainty calibration uses at most 401 uniformly spaced chronological calibration rows, selecting their nearest half by expected workload.',
   'New roles, transfers without same-team history and missing opponent histories abstain; same-team history can carry from the preceding season.',
   'Quarter, scorer and combined markets are not fitted in this bundle. Exact-price validation, current availability/rotation context and independent evaluation remain required before GI or picks.'
  ]:[
   'Diagnostic reuse of the v1 evaluation period; not an untouched holdout.',
   'Current-board population and revised official logs introduce selection and vintage bias.',
   'Pregame role, injuries, teammates, weather, rotation, matchup and goalie context remain missing.',
   conditional?'Workload-neighborhood calibration uses at least 100 errors from the nearest half of at least 200 calibration workloads; it does not establish player-conditional or prospective calibration.':'A pooled empirical error distribution does not establish player-conditional calibration.',
   '48-hour publication lag is a convention, not archived publication-time evidence.',
   quarter?'Quarter forecasts require independently reconciled quarter workload/results; scorer models are unsupported. No probability or GI promotion without exact quotes, independent validation and prospective evidence.':'No quarter/scorer support. No probability or GI promotion without exact quotes, independent validation and prospective evidence.',
  ]};
}
