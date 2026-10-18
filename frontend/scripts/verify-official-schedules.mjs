import {writeFile} from 'node:fs/promises';
const base=process.argv[2]||'https://marvelous-wholeness-production-c8d3.up.railway.app';
const paths={nfl:'football/nfl',cfb:'football/college-football',nba:'basketball/nba',wnba:'basketball/wnba',cbb:'basketball/mens-college-basketball',nhl:'hockey/nhl'};
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${r.status} ${url}`);return r.json()}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const reports=await Promise.all(Object.entries(paths).map(async([sport,path])=>{
 try{
  const summary=await json(`${base}/api/dashboard-summary?sport=${sport}`),games=summary.previewGames||[];
  const days=[...new Set(games.flatMap(g=>[String(g.date).slice(0,10),new Date(Date.parse(g.date)-86400000).toISOString().slice(0,10)]))].sort();
  const official=new Map();
  if(sport==='nhl'){
   for(const day of days){const d=await json(`https://api-web.nhle.com/v1/schedule/${day}`);for(const block of d.gameWeek||[])for(const g of block.games||[])official.set(String(g.id),{date:g.startTimeUTC,away:g.awayTeam?.abbrev,home:g.homeTeam?.abbrev})}
  }else if(days.length){
   for(const day of days){
    const d=await json(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day.replaceAll('-','')}&limit=1000${sport==='cfb'?'&groups=80':sport==='cbb'?'&groups=50':''}`);
    for(const e of d.events||[]){const teams=e.competitions?.[0]?.competitors||[],a=teams.find(t=>t.homeAway==='away'),h=teams.find(t=>t.homeAway==='home');official.set(String(e.id),{date:e.date,away:a?.team?.abbreviation,home:h?.team?.abbreviation})}
   }
  }
  const checks=games.map(g=>{const o=official.get(String(g.id));return {id:g.id,matchup:`${g.awayAbbr} @ ${g.homeAbbr}`,found:!!o,teamsMatch:!!o&&norm(g.awayAbbr)===norm(o.away)&&norm(g.homeAbbr)===norm(o.home),timeMatch:!!o&&Math.abs(Date.parse(g.date)-Date.parse(o.date))<=60000}});
  return {sport,games:games.length,checks,pass:checks.every(c=>c.found&&c.teamsMatch&&c.timeMatch),source:sport==='nhl'?'api-web.nhle.com':'site.api.espn.com'};
 }catch(e){return {sport,pass:false,error:e.message}}
}));
const report={at:new Date().toISOString(),scope:'Published preview game identity, away/home teams and start time only; not roster, grading or full schedule completeness.',reports,pass:reports.every(r=>r.pass)};
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
