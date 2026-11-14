import {createHash} from 'node:crypto';
/** Pure evidence logic shared by the CLI and isolated Worker. No storage or network. */
export function createNhlShadowEvidence({nhlShadowForecast,priceNhlShadow,forecastDistribution,evaluatePrice,quoteProblem}){
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=value=>createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
const validDate=s=>Number.isFinite(Date.parse(s));
function verifyShadowReceipt(receipt){
 const {sha256,...body}=receipt;
 if(sha256!==digest(body))throw Error('Shadow receipt checksum mismatch');
 if(body.kind!=='cw08_nhl_shadow_pregame'||body.production!==false||body.forecast.selectionApproved!==false||Date.parse(body.createdAt)>=Date.parse(body.target.gameTime))throw Error('Invalid shadow receipt');
 if(body.historySha256!==digest(body.history)||body.modelFreeze.modelDigest!==digest(body.model))throw Error('Shadow source/model digest mismatch');
 return body;
}
function captureNhlShadow({target,quote,history,officialFixture,sourceFetchedAt,model,baselineModel,modelFreeze,protocolSha256},now=Date.now()){
 const at=new Date(now).toISOString();
 if(!validDate(sourceFetchedAt)||Date.parse(sourceFetchedAt)>now||now-Date.parse(sourceFetchedAt)>60_000)throw Error('Fresh source capture required');
 if(!validDate(modelFreeze?.at)||Date.parse(modelFreeze.at)>Date.parse(sourceFetchedAt)||!modelFreeze.commit||modelFreeze.modelDigest!==digest(model)||!protocolSha256)throw Error('Frozen model receipt required');
 if(target.sport!=='nhl'||!['goals','assists'].includes(target.market)||Date.parse(target.gameTime)-now<=120_000||Date.parse(target.gameTime)-now>48*3600000)throw Error('Upcoming NHL fixture required');
 if(!officialFixture||String(officialFixture.id)!==target.gameId||String(officialFixture.season)!==target.season||officialFixture.gameType!==2||Date.parse(officialFixture.startTimeUTC)!==Date.parse(target.gameTime)||!['FUT','PRE'].includes(officialFixture.gameState))throw Error('Exact official pregame fixture required');
 const teams=[officialFixture.homeTeam?.abbrev,officialFixture.awayTeam?.abbrev];if(!teams.includes(target.teamId)||!teams.includes(target.opponentId)||target.teamId===target.opponentId)throw Error('Official team identity mismatch');
 if(quote.quoteMarket!==target.market||quote.quotePeriod!=='game')throw Error('Quote market identity mismatch');
 const q={...quote,capturedAt:sourceFetchedAt,decisionAt:at};const issue=quoteProblem(q,target);if(issue)throw Error(issue);
 const input=history.filter(g=>g.sport==='nhl'&&g.market===target.market&&g.playerId===target.playerId&&g.gameId!==target.gameId&&Date.parse(g.gameTime)<now-48*3600000);
 if(new Set(input.map(g=>g.gameId)).size!==input.length)throw Error('Duplicate player-game history');
 const candidate=nhlShadowForecast(model,input,target,at);if(!candidate.forecast)throw Error(candidate.reason);
 const baseline=forecastDistribution(baselineModel,input,target,at);if(!baseline.forecast)throw Error(baseline.reason);
 const pricing=priceNhlShadow(candidate.forecast,q);
 const body={version:1,kind:'cw08_nhl_shadow_pregame',production:false,createdAt:at,sourceFetchedAt,modelFreeze,protocolSha256,target:{sport:target.sport,market:target.market,season:target.season,gameId:target.gameId,playerId:target.playerId,teamId:target.teamId,opponentId:target.opponentId,gameTime:target.gameTime},quote:q,officialFixture,model,baselineModel,history:input,historySha256:digest(input),forecast:{...candidate.forecast,pricing},baseline:{projection:baseline.forecast.projection,features:baseline.forecast.inputFeatures,pricing:evaluatePrice(baseline.forecast.values,q)},selectionApproved:false};
 return {...body,sha256:digest(body)};
}
function gradeNhlShadow(receipt,official,now=Date.now()){
 const body=verifyShadowReceipt(receipt),target=body.target;
 if(String(official.id)!==target.gameId||Date.parse(official.startTimeUTC)!==Date.parse(target.gameTime)||String(official.season)!==target.season||official.gameType!==2||!['OFF','FINAL'].includes(official.gameState)||now<Date.parse(target.gameTime))throw Error('Exact official final required');
 if(![official.homeTeam?.abbrev,official.awayTeam?.abbrev].includes(target.opponentId))throw Error('Final opponent mismatch');
 const side=official.homeTeam?.abbrev===target.teamId?'homeTeam':official.awayTeam?.abbrev===target.teamId?'awayTeam':null;
 if(!side)throw Error('Final team mismatch');
 const stats=official.playerByGameStats?.[side];if(!Array.isArray(stats?.forwards)||!Array.isArray(stats?.defense))throw Error('Final skater results missing');
 const matches=[...stats.forwards,...stats.defense].filter(p=>String(p.playerId)===target.playerId);
 if(matches.length!==1||!Number.isInteger(matches[0][target.market])||matches[0][target.market]<0)throw Error('Exact participant result unavailable');
 const actual=matches[0][target.market],line=body.quote.line,sidePicked=body.forecast.pricing.candidateSide;
 const status=actual===line?'push':sidePicked==null?'abstained':(sidePicked==='OVER'?actual>line:actual<line)?'hit':'miss';
 const odds=sidePicked==='OVER'?body.quote.overPrice:body.quote.underPrice;
 const profit=status==='push'?0:status==='abstained'?null:status==='miss'?-1:odds>0?odds/100:100/-odds;
 const result={version:1,kind:'cw08_nhl_shadow_grade',production:false,receiptSha256:receipt.sha256,officialSha256:digest(official),gradedAt:new Date(now).toISOString(),target:body.target,actual,status,profit};
 return {...result,sha256:digest(result)};
}

return {canonical,digest,verifyShadowReceipt,captureNhlShadow,gradeNhlShadow};
}
