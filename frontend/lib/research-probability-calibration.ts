/** Research-only monotone Platt calibration; never imported by live forecasts. */
export type Calibration={intercept:number;slope:number;samples:number;iterations:2000;ridge:1};
const sigmoid=(x:number)=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
const logit=(p:number)=>Math.log(Math.max(1e-6,Math.min(1-1e-6,p))/(1-Math.max(1e-6,Math.min(1-1e-6,p))));
function probability(p:number){if(!Number.isFinite(p)||p<0||p>1)throw Error('Invalid probability');return p;}
export function fitResearchCalibration(rows:{p:number;y:number}[]):Calibration|null{
 for(const r of rows){probability(r.p);if(r.y!==0&&r.y!==1)throw Error('Binary outcome required');}
 if(rows.length<30)return null;
 let intercept=0,slope=1;
 for(let i=0;i<2000;i++){
  let a=intercept/rows.length,b=(slope-1)/rows.length;
  for(const r of rows){const x=logit(r.p),error=sigmoid(intercept+slope*x)-r.y;a+=error/rows.length;b+=error*x/rows.length;}
  intercept-=.1*a;slope=Math.max(0,Math.min(5,slope-.1*b));
 }
 return {intercept,slope,samples:rows.length,iterations:2000,ridge:1};
}
export function researchCalibratedProbability(model:Calibration,p:number){
 probability(p);if(!Number.isFinite(model.intercept)||!Number.isFinite(model.slope)||model.slope<0||model.slope>5)throw Error('Invalid calibration');
 return sigmoid(model.intercept+model.slope*logit(p));
}
