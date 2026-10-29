import{readFile,writeFile}from'node:fs/promises';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import{loadTs}from'../tests/load-ts.mjs';
const out=process.argv[2];if(!out)throw Error('Candidate study directory required');
const snapshot=JSON.parse(gunzipSync(await readFile('model-runtime/snapshot.json.gz'))),candidate=JSON.parse(gunzipSync(await readFile(out+'/candidate-models.json.gz'))),audit='model-research/2026-10-28/p01-nba-original-audit/';
const source=JSON.parse(await readFile(audit+'accuracy-audit.json')),official=JSON.parse(gunzipSync(await readFile(audit+'official-responses.json.gz')));
const{basketballModelObservations:observed}=await loadTs(new URL('../lib/basketball-model-observations.ts',import.meta.url)),{basketballFeatureIndex:index}=await loadTs(new URL('../lib/basketball-model-inputs.ts',import.meta.url)),{forecastDistribution:forecast,conditionalProbabilities:unused}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const history=new Map(snapshot.observations.filter(r=>r.sport==='nba').map(r=>[[r.market,r.gameId,r.playerId].join('|'),r]));
for(const r of official)if(r.exactCompleted)for(const row of observed(r.payload,{sport:'nba',season:String(r.payload.header.season.year),gameId:r.gameId,source:r.url||'archived official summary',retrievedAt:r.retrievedAt}))history.set([row.market,row.gameId,row.playerId].join('|'),row);
const rows=[...history.values()],indices=new Map(),decisions=[];
for(const d of source.decisions.filter(d=>d.brier!=null)){
 const receipt=official.find(r=>r.gameId===d.gameId&&r.exactCompleted),p=receipt?.payload,teams=p?.boxscore?.players??[];
 const team=teams.find(t=>(t.statistics??[]).some(s=>(s.athletes??[]).some(a=>String(a.athlete?.id)===d.playerId))),c=p?.header?.competitions?.[0],side=c?.competitors?.find(s=>String(s.team.id)===String(team?.team?.id)),opponent=c?.competitors?.find(s=>String(s.team.id)!==String(team?.team?.id));
 if(!team||!side||!opponent||Date.parse(c.date)!==Date.parse(d.gameTime)){decisions.push({...d,replayStatus:'unresolved_identity'});continue;}
 const target={sport:'nba',market:d.market,gameId:d.gameId,playerId:d.playerId,playerName:d.playerName,teamId:String(side.team.id),opponentId:String(opponent.team.id),gameTime:d.gameTime,season:String(p.header.season.year),source:'official fixture identity only; no target stats supplied',retrievedAt:d.savedAt,basketballContext:{home:side.homeAway==='home'}};
 const marketRows=rows.filter(r=>r.market===d.market);if(!indices.has(d.market))indices.set(d.market,index(marketRows));
 const fitted={};for(const [label,models]of [['baseline',snapshot.models],['candidate',candidate.models]]){
 const m=models.find(m=>m.group==='nba|'+d.market),r=m&&forecast(m,marketRows,target,d.savedAt,indices.get(d.market));
 if(!r?.forecast){fitted[label]={reason:r?.reason||'missing_model'};continue;}
 const values=r.forecast.values,n=values.length,over=values.filter(x=>x>d.line).length,under=values.filter(x=>x<d.line).length,total=over+under,probability=total?over/total:null,call=probability==null||probability===.5?null:probability>.5?'OVER':'UNDER';
 fitted[label]={projection:r.forecast.projection,over:probability,side:call,won:call==null?null:call==='OVER'?d.actual>d.line:d.actual<d.line,brier:probability==null?null:(probability-Number(d.actual>d.line))**2};
 }
 decisions.push({...d,replayStatus:fitted.baseline.over!=null&&fitted.candidate.over!=null?'paired':'inputs_unavailable',...fitted});
}
const reports=['points','rebounds','assists','threes_made','steals','blocks'].map(market=>{const rs=decisions.filter(d=>d.market===market&&d.replayStatus==='paired');return {market,paired:rs.length,...Object.fromEntries(['baseline','candidate'].map(p=>[p,{calls:rs.filter(r=>r[p].side).length,hits:rs.filter(r=>r[p].won).length,brier:rs.length?rs.reduce((s,r)=>s+r[p].brier,0)/rs.length:null}]))};});
const report={createdAt:new Date().toISOString(),limitations:['Already inspected outcomes: retrospective diagnostic only.','Baseline is reconstructed from runtime model and current archived observations, not an exact historical input replay.','Candidate trained on retained runtime subset; live baseline fitted on larger historical population.','Exact line retained; no two-sided prices, ROI or promotion.','Target official boxes used for exact identity/home/season only; features enforce 48h lag.'],reports,decisions,livePromotion:false};await writeFile(out+'/saved-line-diagnostic.json',JSON.stringify(report,null,2)+'\n');
const receipt=JSON.parse(await readFile(out+'/receipt.json'));receipt.files['saved-line-diagnostic.json']=createHash('sha256').update(await readFile(out+'/saved-line-diagnostic.json')).digest('hex');await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(reports));
