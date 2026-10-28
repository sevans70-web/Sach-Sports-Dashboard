import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const [sport,out]=process.argv.slice(2),paths={nba:'nba',wnba:'wnba',cbb:'mens-college-basketball'};
if(!paths[sport]||!out)throw Error('Use nba|wnba|cbb and a NEW output directory');
const hash=x=>createHash('sha256').update(x).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n';
await mkdir(dirname(out),{recursive:true});await mkdir(out,{recursive:false});
const protocol={createdAt:new Date().toISOString(),kind:'Retrospective audit of original saved forecasts, NOT an untouched holdout',selection:'All available original main-market numeric OVER/UNDER probabilities with valid pregame saved/forecast timestamps, exact matching line and fixture older than four hours. Select without grade, outcome, side or confidence filtering. Earliest saved decision per market/fixture/player.',benchmark:'Constant 0.5 conditional probability only; no two-sided market prices available in this source, so no no-vig book or ROI claim.',sourceCoverage:'Report source coverage; missing finals/player statistics remain unresolved, never zero.',promotion:false};
await writeFile(out+'/selection-protocol.json',json(protocol));
const url='https://marvelous-wholeness-production-c8d3.up.railway.app/api/history/performance?sport='+sport+'&period=Season';
const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Source HTTP '+response.status);
const source=await response.json(),receivedAt=new Date().toISOString();await writeFile(out+'/saved-source.json.gz',gzipSync(json(source),{level:9}));
const selected=new Map(),rejections={};const reject=r=>rejections[r]=(rejections[r]||0)+1;
const markets=new Set(['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts','rebs_asts','steals','blocks']);
for(const r of [...(source.records||[])].sort((a,b)=>Date.parse(a.savedAt)-Date.parse(b.savedAt))){
 const p=r.probability,parts=String(r.key||'').split('|'),gameId=parts.at(-2),playerId=parts.at(-1),start=Date.parse(r.gameTime),saved=Date.parse(r.savedAt),forecast=Date.parse(p?.calculatedAt);
 if(!p){reject('no_original_probability');continue;}
 if(!markets.has(r.market)){reject('unsupported_market');continue;}
 if(!/^\d+$/.test(gameId||'')||!/^\d+$/.test(playerId||'')){reject('missing_exact_identity');continue;}
 if(!Number.isFinite(start)||start>Date.parse(receivedAt)-4*3600000){reject('not_past_four_hours');continue;}
 if(!Number.isFinite(saved)||!Number.isFinite(forecast)||saved>=start||forecast>=start||forecast>saved){reject('unverified_pregame_timing');continue;}
 if(!['OVER','UNDER'].includes(p.side)||p.side!==r.pick||typeof r.line!=='number'||p.line!==r.line||!p.quoteId){reject('mismatched_saved_decision');continue;}
 if(![p.win,p.loss,p.push].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1)||p.win+p.loss<=0||Math.abs(p.win+p.loss+p.push-1)>1e-6){reject('invalid_probability');continue;}
 const key=[r.market,gameId,playerId].join('|');if(selected.has(key)){reject('later_duplicate');continue;}
 selected.set(key,{sport,market:r.market,gameId,playerId,playerName:r.playerName,gameTime:r.gameTime,savedAt:r.savedAt,line:r.line,probability:p});
}
await writeFile(out+'/selected-originals.json',json([...selected.values()]));
const {basketballObservedRows}=await loadTs(new URL('../lib/observed-player-stats.ts',import.meta.url));
const ids=[...new Set([...selected.values()].map(r=>r.gameId))],official=[],finals=new Map();
for(let i=0;i<ids.length;i+=3)await Promise.all(ids.slice(i,i+3).map(async gameId=>{
 const url='https://site.api.espn.com/apis/site/v2/sports/basketball/'+paths[sport]+'/summary?event='+gameId;
 try{const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('HTTP '+response.status);const payload=await response.json(),at=new Date().toISOString();
 const exact=String(payload.header?.id)===gameId&&payload.header?.competitions?.[0]?.status?.type?.completed===true;
 official.push({gameId,url,retrievedAt:at,sha256:hash(JSON.stringify(payload)),exactCompleted:exact,payload});if(exact)finals.set(gameId,{gameTime:payload.header.competitions[0].date,rows:basketballObservedRows(payload)});
 }catch(e){official.push({gameId,url,error:e.message});}
}));
const decisions=[...selected.values()].map(r=>{const final=finals.get(r.gameId);const actual=Date.parse(final?.gameTime)===Date.parse(r.gameTime)?final?.rows.find(p=>p.playerId===r.playerId)?.stats[r.market]:null;
 if(typeof actual!=='number'||!Number.isFinite(actual))return {...r,status:'unresolved',reason:finals.has(r.gameId)?'explicit_player_stat_unavailable':'exact_official_final_unavailable'};
 const won=actual===r.line?null:r.probability.side==='OVER'?actual>r.line:actual<r.line,p=r.probability.win/(r.probability.win+r.probability.loss);
 return {...r,actual,status:won==null?'push':won?'hit':'miss',conditional:p,brier:won==null?null:(p-Number(won))**2};});
const summary=(rows)=>{const settled=rows.filter(r=>r.brier!=null),n=settled.length;return {selected:rows.length,settled:n,independentGames:new Set(settled.map(r=>r.gameId)).size,pushes:rows.filter(r=>r.status==='push').length,unresolved:rows.filter(r=>r.status==='unresolved').length,hits:settled.filter(r=>r.status==='hit').length,hitRate:n?settled.filter(r=>r.status==='hit').length/n:null,meanProbability:n?settled.reduce((a,r)=>a+r.conditional,0)/n:null,brier:n?settled.reduce((a,r)=>a+r.brier,0)/n:null,constantHalfBrier:n?.25:null};};
const groups=[];for(const market of [...new Set(decisions.map(r=>r.market))])for(const side of ['OVER','UNDER','ALL'])groups.push({market,side,...summary(decisions.filter(r=>r.market===market&&(side==='ALL'||r.probability.side===side)))});
const report={protocol,source:{url,receivedAt,sha256:hash(JSON.stringify(source)),coverage:source.coverage},rejections,overall:summary(decisions),groups,decisions,officialRequests:official.map(({payload,...r})=>r),validatedForBetting:false,limitations:['Retrospective diagnosis, not a fresh holdout or proof of improved model.','Players within the same fixture are correlated.','Constant 0.5 is not a no-vig sportsbook benchmark; no odds/ROI claim.','No original forecast, historical result or live model is modified.']};
await writeFile(out+'/official-responses.json.gz',gzipSync(json(official),{level:9}));await writeFile(out+'/accuracy-audit.json',json(report));
const files=['selection-protocol.json','saved-source.json.gz','selected-originals.json','official-responses.json.gz','accuracy-audit.json'];await writeFile(out+'/receipt.json',json({createdAt:new Date().toISOString(),files:Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(out+'/'+f))])))}));
console.log(json({sport,coverage:source.coverage,overall:report.overall,rejections,groups}));
