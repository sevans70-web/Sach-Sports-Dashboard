import {dashboardDay} from '@/lib/dashboard-contract';

type Cache = {
 get(key:string,type:'json'):Promise<unknown>;
 put(key:string,value:string,options:{expirationTtl:number}):Promise<void>;
};
const maxAge=10*60_000;
const key=(sport:string,day:string,market:string)=>`sach:pregame-board:v1:${sport}:${day}:${market}`;

export async function cachePregameBoard(binding:unknown,sport:string,market:string,board:any,now=Date.now()){
 const cache=binding as Partial<Cache>|undefined;
 if(typeof cache?.put!=='function'||board?.success!==true||board.market!==market||!Array.isArray(board.rows))return;
 const capturedAt=Date.parse(board.updatedAt||'');
 if(!Number.isFinite(capturedAt)||capturedAt>now||now-capturedAt>=maxAge)return;
 const day=board.boardDay||board.day||dashboardDay(board.rows[0]?.gameTime);
 if(!day)return;
 const rows=board.rows.filter((row:any)=>dashboardDay(row.gameTime)===day&&Date.parse(row.gameTime)>now);
 if(!rows.length)return;
 await cache.put(key(sport,day,market),JSON.stringify({capturedAt,pregameOnly:rows.length===board.rows.length,board:{...board,boardDay:day,rows}}),{expirationTtl:900});
}

export async function readPregameBoard(binding:unknown,sport:string,market:string,day:string,now=Date.now()){
 const cache=binding as Partial<Cache>|undefined;
 if(typeof cache?.get!=='function')return null;
 const entry=await cache.get(key(sport,day,market),'json').catch(()=>null) as {capturedAt:number;pregameOnly:boolean;board:any}|null;
 if(!entry||!Number.isFinite(entry.capturedAt)||entry.capturedAt>now||now-entry.capturedAt>=maxAge||
  entry.board?.market!==market||entry.board?.boardDay!==day||!entry.board?.rows?.length)return null;
 if(entry.board.rows.some((row:any)=>Date.parse(row.gameTime)<=now||dashboardDay(row.gameTime)!==day))return null;
 return entry;
}
