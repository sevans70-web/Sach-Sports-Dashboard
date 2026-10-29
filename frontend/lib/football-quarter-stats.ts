import {footballObservedRows} from '@/lib/football-observed-stats';
const norm=(v:any)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const value=(v:any)=>v==null||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
/** Quarter-specific observed yards. Ambiguous identities or unreconciled tape stay unknown.
 * Counts AND yards must agree with the official full-game/to-date player row. */
export function footballQuarterRows(payload:any){
 const college=String(payload?.header?.league?.id)==='23'||payload?.header?.league?.slug==='college-football';
 const observed=footballObservedRows(payload),aliases=new Map<string,Set<string>>();
 const add=(team:string,alias:string,id:string)=>{const key=team+'|'+norm(alias);if(!norm(alias))return;const ids=aliases.get(key)||new Set<string>();ids.add(id);aliases.set(key,ids)};
 for(const team of payload?.boxscore?.players||[])for(const group of team.statistics||[])for(const row of group.athletes||[]){
  const a=row.athlete||{},id=String(a.id||''),tid=String(team.team?.id||'');if(!id||!tid)continue;
  const name=String(a.displayName||a.fullName||''),parts=name.trim().split(/\s+/),first=a.firstName||parts[0],last=String(a.lastName||parts.slice(1).join(' ')).replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i,'');
  for(const alias of [name,a.shortName,`${String(first).slice(0,1)}.${last}`,`${String(first).slice(0,1)}.${String(a.lastName||last)}`])if(alias)add(tid,String(alias),id);
 }
 const identify=(team:string,token:string)=>{const ids=aliases.get(team+'|'+norm(token));return ids?.size===1?[...ids][0]:null};
 const all:any[]=[...(payload?.plays||[])];
 for(const drive of [...(payload?.drives?.previous||[]),...(payload?.drives?.current?[payload.drives.current]:[])])for(const play of drive.plays||[])all.push({...play,driveTeam:drive.team?.id});
 const unique=[...new Map(all.filter(p=>p?.id||p?.sequenceNumber).map(p=>[String(p.id||p.sequenceNumber),p])).values()];
 const q1=unique.filter(p=>Number(p.period?.number??p.period)===1);
 const transitioned=unique.some(p=>Number(p.period?.number??p.period)>=2);
 const status=payload?.header?.competitions?.[0]?.status;
 const complete=q1.some(p=>p.clock?.displayValue==='15:00')&&(transitioned||(Number(status?.period)===1&&status?.type?.state==='in'));
 const totals=new Map<string,{yards:number;count:number;q1:number;q1Count:number}>(),bad=new Set<string>();
 const record=(id:string|null,market:string,yards:number,count:number,quarter:number)=>{if(!id)return;const key=id+'|'+market,r=totals.get(key)||{yards:0,count:0,q1:0,q1Count:0};r.yards+=yards;r.count+=count;if(quarter===1){r.q1+=yards;r.q1Count+=count}totals.set(key,r)};
 for(const play of unique){
  const quarter=Number(play.period?.number??play.period),team=String(play.start?.team?.id||play.team?.id||play.driveTeam||'');
  const raw=String(play.text||play.shortText||''),text=raw.replace(/^.*?reported in as eligible\.\s*/i,'').replace(/^(?:\s*\([^)]*\)\s*)+/,'').replace(/^(?:(?:no huddle[- ]?)?(?:shotgun|under center)|no huddle)\s+/i,'').replace(/#\d+\s+/g,'').trim(),type=String(play.type?.text||'').toLowerCase();
  if(/no play|play nullified/i.test(raw))continue;
  const pass=text.match(/^(\S+)\s+(?:pass(?:es|ed)?\b|spikes?\b)/i);
  if(pass&&!/sack|two.point|conversion/i.test(type)){
   const passer=identify(team,pass[1]);
   // A target is independent of a completion. Deflected/intercepted passes
   // without an identifiable intended receiver remain unresolved; the final
   // per-player target-count reconciliation below must still pass.
   const target=text.match(/\b(?:intended for|to)\s+(\S+)/i);
   if(target)record(identify(team,target[1]),'targets',0,1,quarter);
   const caught=!/incomplete|intercepted|spike|pass thrown away/i.test(text.split(/TOUCHDOWN/i)[0])&&(/pass reception|passing touchdown|pass completion/i.test(type)||/\bto\s+\S+.*\bfor\s+(?:-?\d+\s+yards?|no gain)/i.test(text));
   const yards=caught?value(play.statYardage??play.yards??play.yardage):0;
   if(yards==null){if(passer)bad.add(passer+'|passing_yards');continue}
   record(passer,'passing_yards',yards,1,quarter);
   if(caught){
    const recipient=text.match(/\bto\s+(\S+)/i),receiver=recipient?identify(team,recipient[1]):null;
    const lateral=/\bLateral to\b/i.test(raw),firstYards=lateral?value(raw.match(/for\s+(-?\d+)\s+yards?/i)?.[1]):yards;
    if(firstYards==null){if(receiver)bad.add(receiver+'|receiving_yards')}else record(receiver,'receiving_yards',firstYards,1,quarter);
    if(lateral)for(const match of raw.matchAll(/Lateral to\s+(\S+)(.*?)(?=Lateral to|$)/gi)){
     const id=identify(team,match[1]),n=value(match[2].match(/for\s+(-?\d+)\s+yards?/i)?.[1]);
     if(n==null){if(id)bad.add(id+'|receiving_yards')}else record(id,'receiving_yards',n,0,quarter);
    }
   }
  }else if(college&&/sack/.test(type)){
   // NCAA charges sack yardage and attempts to the rusher; NFL does not.
   const token=text.match(/^(\S+)\s/),id=token?identify(team,token[1]):null,n=value(play.statYardage??play.yards??play.yardage);
   if(n==null){if(id)bad.add(id+'|rushing_yards')}else record(id,'rushing_yards',n,1,quarter);
  }else if(/rush|rushing|kneel|scramble/.test(type)&&!/return|two.point|conversion/i.test(type+' '+raw)){
   const token=text.match(/^(\S+)\s/),id=token?identify(team,token[1]):null,n=value(play.statYardage??play.yards??play.yardage);
   if(n==null){if(id)bad.add(id+'|rushing_yards')}else record(id,'rushing_yards',n,1,quarter);
  }
 }
 const workloads:Record<string,string>={passing_yards:'pass_attempts',rushing_yards:'rush_attempts',receiving_yards:'receptions'};
 return observed.map(row=>{
  const stats={...row.stats},quarterAudit:Record<string,any>={};
  for(const [market,workload] of Object.entries(workloads)){
   const key=row.playerId+'|'+market,tape=totals.get(key)||{yards:0,count:0,q1:0,q1Count:0},actual=row.stats[market],count=row.stats[workload];
   const reconciled=complete&&!bad.has(key)&&actual!=null&&count!=null&&tape.yards===actual&&tape.count===count;
   stats['q1_'+market]=reconciled?tape.q1:null;
   stats['q1_'+workload]=reconciled?tape.q1Count:null;
   quarterAudit[market]={parsedYards:tape.yards,officialYards:actual,parsedCount:tape.count,officialCount:count,quarterCount:reconciled?tape.q1Count:null,complete,ambiguousYardage:bad.has(key)};
  }
  const targets=totals.get(row.playerId+'|targets')||{count:0,q1Count:0};
  stats.q1_targets=complete&&row.stats.targets!=null&&targets.count===row.stats.targets?targets.q1Count:null;
  return {...row,stats,quarterAudit};
 });
}

/** Full-game/live totals come directly from the official box score. Only a
 * quarter market requires the more expensive reconciled play-by-play pass. */
export function footballRowsForMarket(payload:any,market:string){
 return market.startsWith('q1_')?footballQuarterRows(payload):footballObservedRows(payload);
}
