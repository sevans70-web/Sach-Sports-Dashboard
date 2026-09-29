import {readDurableHistory,writeDurableHistory} from "@/lib/durable-history";
import {cleanNhlName,type NhlMarketKey} from "@/lib/nhl";

export type SavedNhlPrediction={
  key:string; gameDate:string; gameTime:string; gameId:string; matchup:string; market:NhlMarketKey;
  playerId:string; playerName:string; teamName:string; teamLogo?:string; headshot?:string;
  sportsbookLine:number|null; modelProjection:number|null; modelProbability:number|null;
  pickSide:"OVER"|"UNDER"|null; giScore:number; bookmakerCount:number; rank:number|null;
  savedAt:string; status:"pending"|"hit"|"miss"|"push"|"void"; actual:number|null; gradedAt:string|null;
  frozenAt:string|null; recoveredAfterStart?:boolean;
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
    if(old.status!=="pending"){continue}
    if(p.status!=="pending"||(!old.frozenAt&&p.frozenAt)){map.set(p.key,{...old,...p});continue}
    if(old.frozenAt&&!p.frozenAt)continue;
    map.set(p.key,Date.parse(p.savedAt||"")>=Date.parse(old.savedAt||"")?{...old,...p}:old);
  }
  const predictions=[...map.values()]; if(predictions.length)runtime.set(rk(m,day),predictions);
  return {connected:true,writable:true,predictions};
}

export async function saveNhlSlate(m:NhlMarketKey,rows:any[],slateStarted:boolean){
  const day=nhlDay(new Date()), old=await getNhlPredictions(m,day), now=new Date().toISOString();
  const existing=new Map(old.predictions.map(p=>[p.key,p]));
  const next:SavedNhlPrediction[]=[];
  for(const row of rows.slice(0,25)){
    if(!row?.playerId)continue;
    const key=`${day}|${m}|${row.playerId}|${cleanNhlName(row.matchup||"")}`;
    const prior=existing.get(key);
    if(slateStarted&&prior){next.push(prior.frozenAt?prior:{...prior,frozenAt:now});continue}
    next.push({
      key,gameDate:day,gameTime:String(row.gameTime||""),gameId:String(row.gameId||""),matchup:String(row.matchup||""),market:m,
      playerId:String(row.playerId),playerName:String(row.playerName||""),teamName:String(row.teamName||""),teamLogo:String(row.teamLogo||""),headshot:String(row.headshot||""),
      sportsbookLine:row.sportsbookLine==null?null:Number(row.sportsbookLine),modelProjection:row.modelProjection==null?null:Number(row.modelProjection),modelProbability:row.modelProbability==null?null:Number(row.modelProbability),
      pickSide:row.prediction==="OVER"||row.prediction==="UNDER"?row.prediction:null,giScore:Number(row.giScore||0),bookmakerCount:Number(row.bookmakerCount||0),rank:Number(row.rank||0)||null,
      savedAt:now,status:"pending",actual:null,gradedAt:null,frozenAt:slateStarted?now:null,recoveredAfterStart:slateStarted||undefined
    });
  }
  // Once the slate starts, never replace the frozen Top 25 with a fresh board.
  const out=slateStarted&&old.predictions.length?old.predictions.map(p=>p.frozenAt?p:{...p,frozenAt:now}):next;
  runtime.set(rk(m,day),out);
  const ok=await writeDurableHistory("nhl",String(m),day,out);
  return {ok,predictions:out};
}

export async function saveNhlGrades(m:NhlMarketKey,day:string,predictions:SavedNhlPrediction[]){
  runtime.set(rk(m,day),predictions);return writeDurableHistory("nhl",String(m),day,predictions);
}
