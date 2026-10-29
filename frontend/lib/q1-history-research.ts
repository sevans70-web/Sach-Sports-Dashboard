import {fitLinear,predictLinear} from '@/lib/probability-forecast';

/** Independent Q1 research only. Never registered as a live recommendation. */
export type QuarterRow={sport:'nba'|'nfl';market:string;playerId:string;teamId:string;gameId:string;gameTime:string;season:string;actual:number;workload?:number;roleWorkload?:number;starter?:boolean};
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
export function quarterHistoryInput(history:QuarterRow[],target:Pick<QuarterRow,'sport'|'market'|'playerId'|'teamId'|'gameTime'>,availableAt=target.gameTime){
 const decision=Date.parse(availableAt),start=Date.parse(target.gameTime);
 if(!Number.isFinite(decision)||!Number.isFinite(start)||decision>start)return null;
 const cutoff=decision-48*3600000,window=(target.sport==='nba'?366:730)*86400000;
 const prior=history.filter(r=>r.sport===target.sport&&r.market===target.market&&r.playerId===target.playerId&&r.teamId===target.teamId&&Date.parse(r.gameTime)<cutoff&&Date.parse(r.gameTime)>decision-window&&Number.isFinite(r.actual)).sort((a,b)=>a.gameTime.localeCompare(b.gameTime)).slice(-10);
 if(prior.length<5)return null;
 if(target.market==='q1_passing_yards'&&(prior.at(-1)?.roleWorkload??0)<10)return null;
 const recent=prior.slice(-3),values=prior.map(r=>r.actual),avg=mean(values),sd=Math.sqrt(mean(values.map(v=>(v-avg)**2)));
 const role=(r:QuarterRow)=>target.sport==='nba'?Number(r.starter===true):r.workload??0;
 const x=[mean(recent.map(r=>r.actual)),avg,prior.at(-1)!.actual,sd,mean(recent.map(role)),mean(prior.map(role)),role(prior.at(-1)!),values.filter(v=>v===0).length/values.length,Math.min(90,(start-Date.parse(prior.at(-1)!.gameTime))/86400000),prior.length];
 return {x,values,baseline:avg,prior:prior.map(r=>({gameId:r.gameId,gameTime:r.gameTime,actual:r.actual,workload:r.workload,starter:r.starter,roleWorkload:r.roleWorkload}))};
}
export function quarterResearchPoint(model:NonNullable<ReturnType<typeof fitLinear>>,x:number[],sport:string){
 const raw=predictLinear(model,x);return sport==='nba'?Math.max(0,raw):raw;
}
export function quarterResearchDistribution(projection:number,residuals:number[],sport:string){
 return residuals.map(e=>sport==='nba'?Math.max(0,Math.round(projection+e)):Math.round(projection+e)).sort((a,b)=>a-b);
}
/** Preserve the original N+ target; do not misgrade equality as a push. */
export function quarterContractProbabilities(values:number[],line:number,lineType:string){
 if(!values.length||!Number.isFinite(line)||!values.every(Number.isFinite))throw Error('Invalid quarter distribution');
 const milestone=lineType==='milestone';
 return {over:values.filter(v=>milestone?v>=line:v>line).length/values.length,under:values.filter(v=>v<line).length/values.length,push:milestone?0:values.filter(v=>v===line).length/values.length};
}
