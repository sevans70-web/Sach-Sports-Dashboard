import {providerFetch} from '@/lib/provider-fetch';

export type SearchPlayer={sport:string;id:string;name:string;team:string;image:string;position:string;league:string;source:'espn'|'mlb';href:string};
export const SEARCH_LEAGUES:Record<string,string>={nba:'basketball/nba',wnba:'basketball/wnba',nfl:'football/nfl',cfb:'football/college-football',cbb:'basketball/mens-college-basketball',nhl:'hockey/nhl',soccer:'soccer'};
const sports:Record<string,string>={nba:'nba',wnba:'wnba',nfl:'nfl','college-football':'cfb','mens-college-basketball':'cbb',nhl:'nhl'};
export function searchName(value:string){return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/['’‘.]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
export function matchesPlayer(name:string,query:string){const n=searchName(name),q=searchName(query);return !!q&&(n.replaceAll(' ','').includes(q.replaceAll(' ',''))||q.split(' ').every(t=>n.includes(t)));}
export function playerPageHref(p:Omit<SearchPlayer,'href'>){
 const q=new URLSearchParams({name:p.name,team:p.team});
 if(p.image)q.set('img',p.image);if(p.position)q.set('position',p.position);if(p.league)q.set('league',p.league);
 if(p.sport==='nhl'&&p.source==='espn')q.set('source','espn');
 return `/${p.sport}/player/${encodeURIComponent(p.id)}?${q}`;
}
export function parseSearchPlayers(payload:any,query:string):SearchPlayer[]{
 return (payload?.results||[]).filter((g:any)=>g.type==='player').flatMap((g:any)=>g.contents||[]).flatMap((p:any)=>{
  const sport=p.sport==='soccer'?'soccer':sports[p.defaultLeagueSlug],id=String(p.uid||'').match(/(?:^|~)a:(\d+)(?:~|$)/)?.[1]||String(p.link?.web||'').match(/\/id\/(\d+)/)?.[1];
  if(!sport||!id||!p.displayName||!matchesPlayer(p.displayName,query))return [];
  const player={sport,id,name:String(p.displayName),team:String(p.subtitle||''),image:String(p.image?.default||''),position:'',league:String(p.defaultLeagueSlug||''),source:'espn' as const};
  return [{...player,href:`/api/player-search/open?${new URLSearchParams({sport,id,name:player.name,team:player.team,img:player.image,league:player.league})}`}];
 });
}
export function parseMlbPlayers(payload:any,query:string):SearchPlayer[]{return (payload?.people||[]).filter((p:any)=>p.isPlayer!==false&&/^\d+$/.test(String(p.id))&&matchesPlayer(p.fullName||'',query)).map((p:any)=>{
 const player={sport:'mlb',id:String(p.id),name:p.fullName,team:String(p.currentTeam?.name||''),image:`https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${p.id}/headshot/67/current`,position:String(p.primaryPosition?.abbreviation||''),league:'mlb',source:'mlb' as const};return {...player,href:playerPageHref(player)};
});}
async function json(url:string,transport:typeof providerFetch){const r=await transport(url,{signal:AbortSignal.timeout(8000),cache:'no-store'});if(!r.ok)throw Error('Player directory unavailable');return r.json();}
const cache=new Map<string,{at:number;data:any}>(),pending=new Map<string,Promise<any>>();
export async function searchPlayers(query:string,transport=providerFetch){
 const key=searchName(query),hit=cache.get(key);if(transport===providerFetch&&hit&&Date.now()-hit.at<300000)return hit.data;
 const lookup=async()=>{
  const espn=async(q:string)=>parseSearchPlayers(await json('https://site.web.api.espn.com/apis/search/v2?'+new URLSearchParams({query:q,type:'player',limit:'50'}),transport),query);
  const sources=await Promise.allSettled([ (async()=>{let rows=await espn(query);if(!rows.length&&key.includes(' '))rows=await espn(key.split(' ').at(-1)!);return rows;})(),json('https://statsapi.mlb.com/api/v1/people/search?'+new URLSearchParams({names:query,hydrate:'currentTeam'}),transport).then(p=>parseMlbPlayers(p,query))]);
  const unavailable=sources.filter(s=>s.status==='rejected').length;
  if(unavailable===sources.length)throw Error('Player search is temporarily unavailable. Please try again.');
  // MLB history uses MLBAM IDs. Never send ESPN baseball IDs to that API.
  const found=sources.flatMap(s=>s.status==='fulfilled'?s.value:[]).filter(p=>p.sport!=='mlb'||p.source==='mlb');
  const players=[...new Map(found.map(p=>[`${p.sport}:${p.id}`,p])).values()].sort((a,b)=>Number(searchName(b.name)===key)-Number(searchName(a.name)===key)||a.name.localeCompare(b.name)||a.sport.localeCompare(b.sport));
  const data={success:true,players:players.slice(0,50),partial:unavailable>0,limited:players.length>=50};
  if(transport===providerFetch&&!unavailable){if(cache.size>=200)cache.delete(cache.keys().next().value!);cache.set(key,{at:Date.now(),data});}return data;
 };
 if(transport!==providerFetch)return lookup();let work=pending.get(key);if(!work){work=lookup().finally(()=>pending.delete(key));pending.set(key,work);}return work;
}
