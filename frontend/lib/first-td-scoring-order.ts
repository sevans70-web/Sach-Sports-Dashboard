export function firstTouchdownResult(payload:any,name:string):number|null{
 const plays=Array.isArray(payload?.scoringPlays)?payload.scoringPlays:[];
 const td=plays.filter((p:any)=>String(p?.scoringType?.name||p?.scoringType?.abbreviation||'').toLowerCase().includes('touchdown'));
 if(!td.length)return null;
 const order=(p:any)=>{const n=Number(p?.period?.number),m=String(p?.clock?.displayValue||'').match(/^(\d+):(\d\d)$/);return Number.isFinite(n)&&m?n*3600-(Number(m[1])*60+Number(m[2])):null};
 if(td.some((p:any)=>order(p)==null))return null;
 td.sort((a:any,b:any)=>order(a)!-order(b)!);
 const text=String(td[0]?.text||td[0]?.shortText||'');
 const match=text.match(/^(.+?)\s+\d+\s+Yd\b/i);
 if(!match)return null;
 const normalize=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const got=normalize(match[1]).split(' '),want=normalize(name).split(' ');
 if(got.join(' ')===want.join(' '))return 1;
 if(got.length>=2&&want.length>=2&&got[0].length===1&&got[0]===want[0][0]&&got.slice(1).join(' ')===want.slice(1).join(' '))return 1;
 return 0;
}

export function verifiedFirstTouchdownScorerId(payload:any,rows:{playerId:string;playerName:string}[]):string|null{
 const hits=rows.filter(r=>r.playerId&&r.playerName&&firstTouchdownResult(payload,r.playerName)===1);
 const ids=[...new Set(hits.map(r=>String(r.playerId)))];
 return ids.length===1?ids[0]:null;
}

export function withVerifiedFirstTouchdownResults(payload:any,rows:any[]){
 const id=verifiedFirstTouchdownScorerId(payload,rows);
 return {verified:id!=null,rows:id==null?rows:rows.map(r=>({...r,stats:{...r.stats,first_td:String(r.playerId)===id?1:0}}))};
}
