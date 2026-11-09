import {checksum} from '../scripts/history-cloud.mjs';
import {isOfficialFinal} from '@/lib/history-save-policy';

type Cache = {
 get(key:string,type:'json'):Promise<unknown>;
 put(key:string,value:string,options:{expirationTtl:number}):Promise<void>;
};
type Observation = {gameId:string;payload:any;checksum:string};
const keyFor=(sport:string,day:string)=>'sach:staging:official-finals:v1:'+sport+':'+day;

export async function readWorkerFinals(cache:Pick<Cache,'get'>,sport:string,day:string){
 const stored=await cache.get(keyFor(sport,day),'json');
 if(!Array.isArray(stored))return [] as Observation[];
 return stored.filter((row):row is Observation=>Boolean(row?.gameId&&isOfficialFinal(row.payload,row.gameId)&&checksum(row.payload)===row.checksum));
}
export async function saveWorkerFinalCorrections(cache:Cache,sport:string,day:string,results:any[]){
 const prior=await readWorkerFinals(cache,sport,day);
 const observations=new Map(prior.map(row=>[row.gameId,row]));
 for(const payload of results){
  const gameId=String(payload?.gameId??'');
  if(!isOfficialFinal(payload,gameId))throw Error('Invalid staging final correction');
  const previous=observations.get(gameId);
  if(previous&&Date.parse(previous.payload.updatedAt||'')>Date.parse(payload.updatedAt||''))continue;
  observations.set(gameId,{gameId,payload,checksum:checksum(payload)});
 }
 await cache.put(keyFor(sport,day),JSON.stringify([...observations.values()]),{expirationTtl:7*86400});
}
