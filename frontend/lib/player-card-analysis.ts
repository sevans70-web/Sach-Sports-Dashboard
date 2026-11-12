import type {PlayerHistoryPoint} from '@/lib/player-card-history';

type Workload = { label:string; key:keyof PlayerHistoryPoint; scale:number; rateUnit:string; divisor?:number };
const minutes:Workload = { label:'minutes', key:'minutes', scale:36, rateUnit:'36 minutes' };
const iceTime:Workload = { label:'minutes on ice', key:'iceTimeSeconds', divisor:60, scale:60, rateUnit:'60 minutes on ice' };

function opportunity(sport:string,market:string):Workload[] {
 if(market.startsWith('q1_')||/first|anytime/.test(market))return [];
 if(sport==='nba'||sport==='wnba'||sport==='cbb'){
  if(market==='threes_made')return [{label:'three-point attempts',key:'threePointAttempts',scale:1,rateUnit:'three-point attempt'},minutes];
  return [minutes];
 }
 if(sport==='nhl'){
  if(market==='goals')return [{label:'shots on goal',key:'shots',scale:1,rateUnit:'shot'},iceTime];
  if(market==='goalie_saves')return [{label:'shots faced',key:'shotsAgainst',scale:1,rateUnit:'shot faced'},iceTime];
  return [iceTime];
 }
 if(sport==='nfl'||sport==='cfb'){
  if(/^passing_(yards|tds|interceptions)$/.test(market))return [{label:'pass attempts',key:'workload',scale:1,rateUnit:'attempt'}];
  if(/^(qb_)?rushing_(yards|tds)$/.test(market))return [{label:'carries',key:'carries',scale:1,rateUnit:'carry'}];
  if(/^(receiving_yards|receptions)$/.test(market))return [{label:'targets',key:'targets',scale:1,rateUnit:'target'}];
 }
 return [];
}

const fmt=(value:number)=>Number(value.toFixed(1)).toString();
const mean=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;
function measured(point:PlayerHistoryPoint,workload:Workload){
 const value=point[workload.key];
 if(value==null||typeof value==='boolean'||String(value).trim()==='')return null;
 const time=workload.key==='minutes'&&/^(\d+):[0-5]\d$/.test(String(value))?String(value).split(':').map(Number):null;
 const parsed=time?time[0]+time[1]/60:Number(value)/(workload.divisor||1);
 return Number.isFinite(parsed)&&parsed>=0?parsed:null;
}
function volume(points:PlayerHistoryPoint[],workload:Workload){
 const values=points.map(point=>measured(point,workload));
 return values.every((value):value is number=>value!=null)?mean(values):null;
}

/** Compare matching windows and use rates only when every game has measured exposure. */
export function playerFormInsight(sport:string,market:string,history:PlayerHistoryPoint[],stat:string){
 const size=Math.min(5,Math.floor(history.length/2));
 if(size<3)return null;
 const recent=history.slice(-size),prior=history.slice(-size*2,-size);
 const now=mean(recent.map(game=>game.value)),before=mean(prior.map(game=>game.value));
 for(const workload of opportunity(sport,market)){
  const currentVolume=volume(recent,workload),priorVolume=volume(prior,workload);
  if(currentVolume==null||priorVolume==null||currentVolume<=0||priorVolume<=0)continue;
  const currentRate=now/currentVolume,priorRate=before/priorVolume;
  const volumeEffect=(currentVolume-priorVolume)*(currentRate+priorRate)/2;
  const rateEffect=(currentRate-priorRate)*(currentVolume+priorVolume)/2;
  const move=now-before;
  const direction=move>0?'rose':'fell';
  let read='Production held roughly steady';
  if(Math.abs(move)>=0.1){
   const main=Math.abs(volumeEffect)>=Math.abs(rateEffect)*2?'volume':Math.abs(rateEffect)>=Math.abs(volumeEffect)*2?'rate':null;
   read=main==='volume'?`Production ${direction} mainly alongside a change in ${workload.label}`:
    main==='rate'?`Production ${direction} mainly alongside a change in output per ${workload.rateUnit}`:
    volumeEffect*rateEffect<0?'Volume and production rate moved in opposite directions':`Both volume and production rate moved as output ${direction}`;
  }
  const extra=market==='points'&&sport==='nba'?basketballShotVolume(recent,prior,currentVolume,priorVolume):'';
  return `${read}. Over the latest ${size} vs. preceding ${size}: ${fmt(now)} vs. ${fmt(before)} ${stat} per game, ${fmt(currentVolume)} vs. ${fmt(priorVolume)} ${workload.label} per game, and ${fmt(currentRate*workload.scale)} vs. ${fmt(priorRate*workload.scale)} ${stat} per ${workload.rateUnit}.${extra}`;
 }
 return `Over the latest ${size} vs. preceding ${size}, production ${now>before?'rose':now<before?'fell':'held'} from ${fmt(before)} to ${fmt(now)} ${stat} per game. Recorded opportunity is incomplete across these games, so the reason for that pattern is unclear.`;
}

function basketballShotVolume(recent:PlayerHistoryPoint[],prior:PlayerHistoryPoint[],currentMinutes:number,priorMinutes:number){
 const shotMetrics:Workload[]=[
  {label:'field-goal attempts',key:'fieldGoalAttempts',scale:1,rateUnit:'attempt'},
  {label:'free-throw attempts',key:'freeThrowAttempts',scale:1,rateUnit:'attempt'},
 ];
 const [shots,freeThrows]=shotMetrics.map(metric=>({now:volume(recent,metric),before:volume(prior,metric)}));
 const shotRead=shots.now!=null&&shots.before!=null?` Field-goal attempts per 36 minutes: ${fmt(shots.now/currentMinutes*36)} vs. ${fmt(shots.before/priorMinutes*36)}.`:'';
 const freeThrowRead=freeThrows.now!=null&&freeThrows.before!=null&&Math.abs(freeThrows.now-freeThrows.before)>=0.5?
  ` Free-throw attempts per game: ${fmt(freeThrows.now)} vs. ${fmt(freeThrows.before)}.`:'';
 return shotRead+freeThrowRead;
}

export function matchupRoleRead(sport:string,market:string,meetings:PlayerHistoryPoint[],recent:PlayerHistoryPoint[]){
 for(const workload of opportunity(sport,market)){
  const recentVolume=volume(recent,workload),meetingVolume=volume(meetings,workload);
  if(recent.length<3||recentVolume==null||meetingVolume==null||recentVolume<=0)continue;
  const ratio=meetingVolume/recentVolume;
  const role=ratio<0.75?'less volume':ratio>1.25?'more volume':'similar volume';
  return ` The ${meetings.length===1?'meeting had':'meetings averaged'} ${fmt(meetingVolume)} ${workload.label} vs. ${fmt(recentVolume)} in recent games (${role}).`;
 }
 return '';
}
