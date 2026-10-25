import {cloudConfigured,readCloudDocument,listCloudDocuments,saveCloudDocument,checksum} from '../scripts/history-cloud.mjs';
const cache=new Map<string,{at:number;rows:any[]}>(),pending=new Map<string,Promise<any[]>>();
export async function cloudHistoryDocuments(sport:string):Promise<any[]>{
 if(!cloudConfigured())return [];
 const hit=cache.get(sport);if(hit&&Date.now()-hit.at<30000)return hit.rows;
 let work=pending.get(sport);if(!work){work=listCloudDocuments(sport).then(rows=>{cache.set(sport,{at:Date.now(),rows});return rows;}).finally(()=>pending.delete(sport));pending.set(sport,work);}return work;
}
const records=new Map<string,{at:number;rows:any[]|null}>(),reads=new Map<string,Promise<any[]|null>>();
const recordKey=(sport:string,stream:string,day:string)=>[sport,stream,day].join('|');
export async function cloudHistoryRead(sport:string,stream:string,day:string){
 if(!cloudConfigured())return null;
 const key=recordKey(sport,stream,day),hit=records.get(key);
 if(hit&&Date.now()-hit.at<(hit.rows?30000:5000))return hit.rows;
 let work=reads.get(key);
 if(!work){work=readCloudDocument(sport,stream,day).then(rows=>{if(records.size>=1024)records.delete(records.keys().next().value!);records.set(key,{at:Date.now(),rows});return rows}).finally(()=>reads.delete(key));reads.set(key,work)}
 return work;
}
export async function cloudHistoryWrite(sport:string,stream:string,day:string,rows:any[]){
 if(!cloudConfigured())return false;
 await saveCloudDocument(sport,stream,day,rows,Buffer.byteLength(JSON.stringify(rows)));
 records.set(recordKey(sport,stream,day),{at:Date.now(),rows});
 const hit=cache.get(sport);if(hit){const updated={stream,game_date:day,payload:rows,checksum:checksum(rows)},index=hit.rows.findIndex(r=>r.stream===stream&&r.game_date===day);if(index>=0)hit.rows[index]=updated;else hit.rows.push(updated);}
 return true;
}

