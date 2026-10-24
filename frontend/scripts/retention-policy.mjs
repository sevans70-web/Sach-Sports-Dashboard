import path from 'node:path';
export const SPORTS=new Set(['nba','nfl','cfb','nhl','mlb','wnba','soccer','cbb']);
export function retentionCutoff(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),g=k=>Number(parts.find(p=>p.type===k)?.value);
 return new Date(Date.UTC(g('year'),g('month')-1,g('day')-6)).toISOString().slice(0,10);
}
export function historyFileInfo(rel){
 const parts=rel.split(path.sep);if(parts[0]!=='sach-history'||!SPORTS.has(parts[1])||!(rel.endsWith('.json')||rel.endsWith('.json.gz')))return null;
 const name=parts.at(-1),dated=name.match(/^(.*?)(?:_)?(\d{4}-\d{2}-\d{2})\.json(?:\.gz)?$/),segment=parts.includes('segments')?parts.at(-2).match(/^(.*)_(\d{4}-\d{2}-\d{2})$/):null;
 const match=segment||dated;if(!match)return null;const day=match[2];if(!Number.isFinite(Date.parse(day+'T00:00Z'))||new Date(day+'T00:00Z').toISOString().slice(0,10)!==day)return null;
 return {sport:parts[1],day,stream:match[1]||'performance',document:!parts.includes('archive')&&!parts.includes('segments')};
}
export const expiredHistory=(rel,now=new Date())=>{const info=historyFileInfo(rel);return Boolean(info&&info.day<retentionCutoff(now));};

export function orphanArchiveInfo(rel){
 if(!/\.json\.\d+\.tmp$/.test(rel)||!rel.split(path.sep).includes('archive'))return null;
 const info=historyFileInfo(rel.replace(/\.json\.\d+\.tmp$/,'.json'));return info?{...info,document:false}:null;
}
