import {fitLinear,predictLinear,type LinearModel} from '@/lib/probability-forecast';
export type QuarterObservation={sport:string;season:string;gameId:string;gameTime:string;playerId:string;playerName:string;teamId:string;market:string;actual:number;role:number;starter?:boolean;source:string;retrievedAt:string};
export type QuarterTarget=Pick<QuarterObservation,'sport'|'season'|'gameId'|'gameTime'|'playerId'|'teamId'|'market'>;
export type QuarterModel={version:1;group:string;model:LinearModel;trainedThrough:string;calibratedThrough:string;residuals:number[];trainingRows:number;calibrationRows:number;validatedForBetting:false};
const avg=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
export function quarterFeatureIndex(observations:QuarterObservation[]){
 const index=new Map<string,QuarterObservation[]>();
 for(const g of observations){const key=[g.sport,g.market,g.playerId,g.teamId].join('|'),xs=index.get(key)||[];xs.push(g);index.set(key,xs)}
 for(const xs of index.values())xs.sort((a,b)=>a.gameTime.localeCompare(b.gameTime));
 return (target:QuarterTarget,decisionAt=target.gameTime)=>{
  const now=Date.parse(decisionAt),start=Date.parse(target.gameTime);
  if(!Number.isFinite(now)||!Number.isFinite(start)||now>start)return {features:null,reason:'invalid_pregame_time'};
  const rows=(index.get([target.sport,target.market,target.playerId,target.teamId].join('|'))||[]).filter(g=>Date.parse(g.gameTime)<now-48*3600000&&Date.parse(g.gameTime)>start-366*86400000&&Number(g.season)<=Number(target.season)&&Number(g.season)>=Number(target.season)-1&&Number.isFinite(g.actual)&&Number.isFinite(g.role)&&g.role>0).slice(-10);
  if(rows.length<5)return {features:null,reason:'fewer_than_five_quarter_history_games'};
  const recent=rows.slice(-3),last=rows.at(-1)!,role3=avg(recent.map(g=>g.role)),role10=avg(rows.map(g=>g.role));
  if(last.role<role3*.4||role3<role10*.5)return {features:null,reason:'quarter_prior_role_uncertain'};
  if(target.market==='q1_passing_yards'&&(last.role<10||recent.some(g=>g.role<10)))return {features:null,reason:'quarter_passing_role_uncertain'};
  const vals=rows.map(g=>g.actual),r=recent.map(g=>g.actual),weight=rows.reduce((s,_,i)=>s+i+1,0),weighted=rows.reduce((s,g,i)=>s+g.actual*(i+1),0)/weight;
  const features=[last.actual,avg(r),avg(vals),weighted,Math.sqrt(avg(vals.map(v=>(v-avg(vals))**2))),avg(r.map(v=>Number(v===0))),avg(vals.map(v=>Number(v===0))),role3,role10,last.role,Number(last.starter===true),avg(recent.map(g=>Number(g.starter===true))),Math.min(30,(start-Date.parse(last.gameTime))/86400000),Number(last.season!==target.season)];
  return {features,baseline:weighted,historyGames:rows.length,latestHistoryAt:last.gameTime,historyEvidence:rows.map(g=>({gameId:g.gameId,gameTime:g.gameTime,actual:g.actual,role:g.role,starter:g.starter===true,source:g.source,retrievedAt:g.retrievedAt})),reason:null};
 };
}
export function fitQuarterModel(group:string,rows:{features:number[];actual:number;gameTime:string}[],calibration:{features:number[];actual:number;gameTime:string}[]):QuarterModel|null{
 if(rows.length<100||calibration.length<100)return null;
 const model=fitLinear(rows.map(r=>({x:r.features,y:r.actual})));if(!model)return null;
 const minimum=group.startsWith('nba|')?0:null;
 const point=(x:number[])=>{const n=predictLinear(model,x);return minimum==null?n:Math.max(minimum,n)};
 return {version:1,group,model,trainingRows:rows.length,calibrationRows:calibration.length,trainedThrough:rows.at(-1)!.gameTime,calibratedThrough:calibration.at(-1)!.gameTime,residuals:calibration.map(r=>r.actual-point(r.features)),validatedForBetting:false};
}
export function quarterPoint(model:QuarterModel,features:number[]){const value=predictLinear(model.model,features);return Math.max(0,value)}
