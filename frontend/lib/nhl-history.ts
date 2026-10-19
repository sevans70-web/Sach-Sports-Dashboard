import {correctedGrade} from "@/lib/grade-reconciliation";
import {eligiblePropPrediction} from "@/lib/prop-integrity";
import {readDurableHistory,writeDurableHistory} from "@/lib/durable-history";
import {cleanNhlName,type NhlMarketKey} from "@/lib/nhl";
import {withHistoryLock} from "@/lib/history-lock";

export type SavedNhlPrediction={
  key:string; gameDate:string; gameTime:string; gameId:string; matchup:string; market:NhlMarketKey;
  playerId:string; playerName:string; teamName:string; teamLogo?:string; headshot?:string;
  sportsbookLine:number|null; modelProjection:number|null; modelProbability:number|null;
  pickSide:"OVER"|"UNDER"|null; giScore:number; bookmakerCount:number; rank:number|null;
  savedAt:string; status:"pending"|"hit"|"miss"|"push"|"void"; actual:number|null; gradedAt:string|null;
  frozenAt:string|null; recoveredAfterStart?:boolean;
  voidReason?:string; voidReasonCode?:string;
};

const runtime=new Map<string,SavedNhlPrediction[]>();
const rk=(m:NhlMarketKey,d:string)=>`${m}|${d}`;
export function nhlDay(v:Date|string=new Date()){
  const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return"";
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`;
}

export async function getNhlPredictions(m:NhlMarketKey,day:string){
  const disk=await readDurableHistory<SavedNhlPrediction>("nhl",String(m),day);
  const mem=runtime.get(rk(m,day))||[];
  const map=new Map<string,SavedNhlPrediction>();
  for(const p of [...disk,...mem]){
    if(!p?.key)continue; const old=map.get(p.key);
    if(!old){map.set(p.key,p);continue}
    if(old.status!=="pending"){const correction=correctedGrade(old,p);if(correction)map.set(p.key,correction);continue}
    if(p.status!=="pending"||(!old.frozenAt&&p.frozenAt)){map.set(p.key,{...old,...p});continue}
    if(old.frozenAt&&!p.frozenAt)continue;
    map.set(p.key,Date.parse(p.savedAt||"")>=Date.parse(old.savedAt||"")?{...old,...p}:old);
  }
  const predictions=[...map.values()]; if(predictions.length)runtime.set(rk(m,day),predictions);
  return {connected:true,writable:true,predictions};
}

export async function saveNhlSlate(m:NhlMarketKey,rows:any[],_slateStarted:boolean){
 rows=rows.filter(row=>eligiblePropPrediction(row));
 if(!rows.length)return {ok:false,predictions:[]};

  const groups=new Map<string,any[]>();for(const row of rows.slice(0,25)){const day=nhlDay(row.gameTime||new Date()),group=groups.get(day)||[];group.push(row);groups.set(day,group)}
  const results=await Promise.all([...groups].map(([day,bucket])=>withHistoryLock(`nhl|${m}|${day}`,()=>saveNhlDay(m,bucket,day))));
  return {ok:results.every(r=>r.ok),predictions:results.flatMap(r=>r.predictions)};
}
async function saveNhlDay(m:NhlMarketKey,rows:any[],day:string){
  const old=await getNhlPredictions(m,day), now=new Date().toISOString();
  const existing=new Map(old.predictions.map(p=>[p.key,p]));
  const next:SavedNhlPrediction[]=[];
  for(const row of rows.slice(0,25)){
    if(!row?.playerId)continue;
    const key=`${day}|${m}|${row.playerId}|${cleanNhlName(row.matchup||"")}`;
    const prior=existing.get(key);
    const rowStarted=row.gameState==="in"||row.gameState==="post"||Boolean(row.gameTime&&Date.parse(row.gameTime)<=Date.now()&&!/postponed|delayed/i.test(row.gameStatus||""));
    const priorStarted=Boolean(prior?.gameTime&&Date.parse(prior.gameTime)<=Date.now());
    if(prior&&(rowStarted||priorStarted||prior.status!=="pending")){next.push(prior.frozenAt?prior:{...prior,frozenAt:now});continue}
    next.push({
      key,gameDate:day,gameTime:String(row.gameTime||""),gameId:String(row.gameId||""),matchup:String(row.matchup||""),market:m,
      playerId:String(row.playerId),playerName:String(row.playerName||""),teamName:String(row.teamName||""),teamLogo:String(row.teamLogo||""),headshot:String(row.headshot||""),
      sportsbookLine:row.sportsbookLine==null?null:Number(row.sportsbookLine),modelProjection:row.modelProjection==null?null:Number(row.modelProjection),modelProbability:row.modelProbability==null?null:Number(row.modelProbability),
      pickSide:row.prediction==="OVER"||row.prediction==="UNDER"?row.prediction:null,giScore:Number(row.giScore||0),bookmakerCount:Number(row.bookmakerCount||0),rank:Number(row.rank||0)||null,
      savedAt:now,status:rowStarted?"void":"pending",actual:null,gradedAt:rowStarted?now:null,frozenAt:rowStarted?now:null,recoveredAfterStart:rowStarted||undefined
    });
  }
  // Lock each game at its own puck drop. An earlier game must not freeze
  // unposted lines for all later games. Keep every older record in history.
  const merged=new Map(old.predictions.map(p=>[p.key,p]));for(const p of next)merged.set(p.key,p);
  const out=[...merged.values()];
  runtime.set(rk(m,day),out);
  const ok=await writeDurableHistory("nhl",String(m),day,out);
  return {ok,predictions:out};
}

export async function saveNhlGrades(m:NhlMarketKey,day:string,predictions:SavedNhlPrediction[]){
 return withHistoryLock(`nhl|${m}|${day}`,async()=>{
  const current=await getNhlPredictions(m,day),merged=new Map(current.predictions.map(p=>[p.key,p]));
  for(const p of predictions){const old=merged.get(p.key);if(!old)merged.set(p.key,p);else if(correctedGrade(old,p))merged.set(p.key,correctedGrade(old,p)!);else if(old.status==="pending"&&p.status!=="pending")merged.set(p.key,{...old,status:p.status,actual:p.actual,gradedAt:p.gradedAt,voidReason:p.voidReason,voidReasonCode:p.voidReasonCode});}
  const out=[...merged.values()];runtime.set(rk(m,day),out);return writeDurableHistory("nhl",String(m),day,out);
 });
}
