import {cloudConfigured,listCloudDocuments,saveCloudDocument,checksum} from '../scripts/history-cloud.mjs';
const cache=new Map<string,{at:number;rows:any[]}>(),pending=new Map<string,Promise<any[]>>();
export async function cloudHistoryDocuments(sport:string):Promise<any[]>{
 if(!cloudConfigured())return [];
 const hit=cache.get(sport);if(hit&&Date.now()-hit.at<30000)return hit.rows;
 let work=pending.get(sport);if(!work){work=listCloudDocuments(sport).then(rows=>{cache.set(sport,{at:Date.now(),rows});return rows;}).finally(()=>pending.delete(sport));pending.set(sport,work);}return work;
}
export async function cloudHistoryRead(sport:string,stream:string,day:string){return (await cloudHistoryDocuments(sport)).find(r=>r.stream===stream&&r.game_date===day)?.payload??null;}
export async function cloudHistoryWrite(sport:string,stream:string,day:string,rows:any[]){
 if(!cloudConfigured())return false;
 await saveCloudDocument(sport,stream,day,rows,Buffer.byteLength(JSON.stringify(rows)));
 const hit=cache.get(sport);if(hit){const updated={stream,game_date:day,payload:rows,checksum:checksum(rows)},index=hit.rows.findIndex(r=>r.stream===stream&&r.game_date===day);if(index>=0)hit.rows[index]=updated;else hit.rows.push(updated);}
 return true;
}
