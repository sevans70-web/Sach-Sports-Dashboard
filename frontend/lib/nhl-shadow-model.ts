import {probabilityInputs,evaluateProbabilityPrice,type ExactQuote} from '@/lib/probability-forecast';
import type {OpportunityGame} from '@/lib/opportunity-backtest';

export type NhlShadowModel={version:3;market:'goals'|'assists';trainedThrough:string;calibratedThrough:string;means:number[];scales:number[];eventCoefficients:number[];positiveCoefficients:number[];positiveFactor:number;globalOffset:number;roleOffsets:number[];calibrationPolicy:'global'|'role';skillPrior:{event:number;rate:number;minutes:number;games:number;historyGames:number};selectionApproved:false};
const linear=(b:number[],x:number[])=>b[0]+x.reduce((n,v,i)=>n+v*b[i+1],0);

/** Research only. Persistent player skill crosses seasons; current ice-time
 * role and eligibility still require same-season, same-team history. */
export function nhlShadowForecast(model:NhlShadowModel,history:OpportunityGame[],target:Omit<OpportunityGame,'actual'|'workload'>,decisionAt:string){
 if(target.sport!=='nhl'||!['goals','assists'].includes(target.market)||model.market!==target.market||model.version!==3||model.selectionApproved!==false)throw Error('Invalid NHL shadow model scope');
 if(![decisionAt,target.gameTime,model.trainedThrough,model.calibratedThrough].every(s=>Number.isFinite(Date.parse(s)))||Date.parse(model.trainedThrough)>Date.parse(model.calibratedThrough)||Date.parse(decisionAt)>Date.parse(target.gameTime)||Date.parse(decisionAt)-48*3600000<=Date.parse(model.calibratedThrough))throw Error('Invalid shadow decision time');
 if(model.means.length!==14||model.scales.length!==14||model.scales.some(v=>!Number.isFinite(v)||v<=0)||model.eventCoefficients.length!==15||model.positiveCoefficients.length!==15||![...model.means,...model.eventCoefficients,...model.positiveCoefficients,model.positiveFactor,model.globalOffset,...model.roleOffsets].every(Number.isFinite)||model.positiveFactor<=0||model.roleOffsets.length!==3)throw Error('Invalid shadow coefficients');
 const input=probabilityInputs(history,target,decisionAt);if(!input.features)return {reason:input.reason,forecast:null};
 const cutoff=Date.parse(decisionAt)-48*3600000,p=model.skillPrior;
 if(p.games!==20||p.historyGames!==60||p.event<=0||p.event>=1||p.rate<=0||p.minutes<=0||!['global','role'].includes(model.calibrationPolicy))throw Error('Invalid skill prior');
 const past=history.filter(g=>g.sport==='nhl'&&g.market===target.market&&g.playerId===target.playerId&&Date.parse(g.gameTime)<cutoff).sort((a,b)=>a.gameTime.localeCompare(b.gameTime)).slice(-60);
 if(past.some(g=>!Number.isInteger(g.actual)||g.actual<0||!Number.isFinite(g.workload)||g.workload<0))throw Error('Invalid history observation');
 const q=(past.filter(g=>g.actual>0).length+20*p.event)/(past.length+20);
 const rate=(past.reduce((n,g)=>n+g.actual,0)+20*p.minutes*p.rate)/(past.reduce((n,g)=>n+g.workload,0)+20*p.minutes);
 const x=[...input.features,Math.log(q/(1-q)),Math.log(rate),input.features[0]*rate,Math.log1p(past.length)];
 const normalized=x.map((v,i)=>(v-model.means[i])/model.scales[i]),band=x[0]<12?0:x[0]<18?1:2;
 const offset=model.calibrationPolicy==='role'?model.roleOffsets[band]:model.globalOffset;
 const eta=linear(model.eventCoefficients,normalized)+offset,eventProbability=1/(1+Math.exp(-eta));
 const lambda=Math.exp(Math.max(-20,Math.min(20,linear(model.positiveCoefficients,normalized))))*model.positiveFactor;
 if(!Number.isFinite(lambda)||lambda<=0||lambda>100||!Number.isFinite(eventProbability))throw Error('Invalid shadow count rate');
 return {reason:null,forecast:{features:x,eventProbability,lambda,projection:eventProbability*lambda/(-Math.expm1(-lambda)),selectionApproved:false as const}};
}
export function nhlHurdleMass(eventProbability:number,lambda:number){
 if(!Number.isFinite(eventProbability)||eventProbability<0||eventProbability>1||!Number.isFinite(lambda)||lambda<=0||lambda>100)throw Error('Invalid hurdle parameters');
 const masses=[1-eventProbability];let pk=eventProbability*Math.exp(-lambda)/(-Math.expm1(-lambda));
 for(let k=1;k<=256;k++){pk*=lambda/k;masses.push(pk);if(k>lambda&&pk<1e-15)break;}
 const sum=masses.reduce((a,b)=>a+b,0);if(Math.abs(sum-1)>1e-10)throw Error('Count tail incomplete');
 return masses.map(p=>p/sum);
}
export function priceNhlShadow(forecast:{eventProbability:number;lambda:number},quote:ExactQuote){
 if(!Number.isFinite(quote.line)||quote.line<0||!Number.isInteger(quote.line*2)||quote.sport!=='nhl'||!['goals','assists'].includes(quote.market)||quote.period!=='game'||quote.mainLine!==true||![quote.overPrice,quote.underPrice].every(p=>Number.isFinite(p)&&Math.abs(p)>=100))throw Error('Invalid shadow quote');
 const masses=nhlHurdleMass(forecast.eventProbability,forecast.lambda);let over=0,under=0,push=0;
 masses.forEach((p,k)=>{if(k>quote.line)over+=p;else if(k<quote.line)under+=p;else push+=p;});
 const sum=over+under+push;
 return {...evaluateProbabilityPrice({over:over/sum,under:under/sum,push:push/sum},quote,0),selectionApproved:false};
}
