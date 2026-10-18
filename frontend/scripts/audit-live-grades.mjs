import fs from 'node:fs/promises';
const origin=process.argv[2]||'https://marvelous-wholeness-production-c8d3.up.railway.app';
const output=process.argv[3]||'/tmp/sach-grade-audit.json';
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`${r.status} ${url}`);return r.json();};
const report={at:new Date().toISOString(),origin,groups:[],games:[],cards:[]};
for(const group of ['QB','Offense','Q1']){
 let p;try{p=await get(`${origin}/api/nfl/performance?period=Today&group=${group}`);}catch(e){report.groups.push({group,error:e.message,rows:[]});continue;}
 report.groups.push({group,summary:p.researchSummary,rows:p.predictions||[]});
 console.log(JSON.stringify({group,summary:p.researchSummary,rows:p.predictions?.length}));
 await fs.writeFile(output,JSON.stringify(report,null,2));
}
const rows=report.groups.flatMap(g=>g.rows);
for(const gameId of [...new Set(rows.filter(r=>r.gameId).map(r=>String(r.gameId)))]){
 const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`;
 try{const payload=await get(url);report.games.push({gameId,url,payload});console.log(JSON.stringify({gameId,final:payload.header?.competitions?.[0]?.status?.type?.completed}));}catch(e){report.games.push({gameId,error:e.message});}
}
for(const market of ['passing_yards','rushing_yards','receiving_yards','anytime_td']){
 try{const p=await get(`${origin}/api/nfl/rankings?market=${market}`);report.cards.push({market,payload:p});console.log(JSON.stringify({market,rows:p.rows?.length}));}catch(e){report.cards.push({market,error:e.message});}
}
await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(output);
