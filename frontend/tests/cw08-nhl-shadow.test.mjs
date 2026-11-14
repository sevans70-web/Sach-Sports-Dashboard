import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
import {loadTs} from './load-ts.mjs';import {captureNhlShadow,saveShadowReceipt,verifyShadowReceipt,gradeNhlShadow,digest} from '../scripts/nhl-shadow-evidence.mjs';
const {nhlShadowForecast,nhlHurdleMass,priceNhlShadow}=await loadTs(new URL('../lib/nhl-shadow-model.ts',import.meta.url));
const {quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const now=Date.parse('2026-11-14T12:00:00Z'),at=new Date(now).toISOString(),linear=n=>({means:Array(10).fill(0),scales:Array(10).fill(1),coefficients:[n,...Array(10).fill(0)]});
function fixture(market='goals'){
 const model={version:3,market,trainedThrough:'2025-02-08',calibratedThrough:'2025-04-17',means:Array(14).fill(0),scales:Array(14).fill(1),eventCoefficients:[Math.log(.3/.7),...Array(14).fill(0)],positiveCoefficients:[Math.log(.5),...Array(14).fill(0)],positiveFactor:1,globalOffset:0,roleOffsets:[0,0,0],calibrationPolicy:'role',skillPrior:{event:.2,rate:.01,minutes:18,games:20,historyGames:60},selectionApproved:false};
 const target={sport:'nhl',market,season:'20262027',gameId:'2026020311',playerId:'123',teamId:'A',opponentId:'B',gameTime:'2026-11-14T23:00:00Z'};
 const quote={sport:'nhl',market,period:'game',gameId:target.gameId,playerId:target.playerId,bookmaker:'test_book',quoteId:'test_quote',line:.5,overPrice:300,underPrice:-400,updatedAt:'2026-11-14T11:59:00Z',capturedAt:at,decisionAt:at,mainLine:true,quoteMarket:market,quotePeriod:'game'};
 const history=Array.from({length:8},(_,i)=>({...target,gameId:String(i),gameTime:new Date(Date.UTC(2026,10,1+i)).toISOString(),actual:i%2,workload:18,source:'synthetic test fixture',retrievedAt:at}));
 const officialFixture={id:Number(target.gameId),season:20262027,gameType:2,startTimeUTC:target.gameTime,gameState:'FUT',homeTeam:{abbrev:'A'},awayTeam:{abbrev:'B'}};
 const baselineModel={version:1,group:'nhl|'+market,trainedThrough:'2025-02-08',calibratedThrough:'2025-04-17',workload:linear(18),rate:linear(.02),minimum:0,integer:true,residuals:[-.3,-.2,-.1,1],trainingRows:200,calibrationRows:100,validatedForBetting:false};
 return {target,quote,history,officialFixture,sourceFetchedAt:at,model,baselineModel,modelFreeze:{commit:'test-only',at:'2026-11-13T12:00:00Z',modelDigest:digest(model)},protocolSha256:'test-protocol'};
}
test('hurdle probability normalization, mean and exact integer pushes',()=>{
 for(const q of [0,.1,.5,1])for(const l of [.001,.5,3,20,100]){
  const mass=nhlHurdleMass(q,l);assert.ok(Math.abs(mass.reduce((a,b)=>a+b,0)-1)<1e-10);
  assert.ok(Math.abs(mass.reduce((a,b,k)=>a+k*b,0)-q*l/(-Math.expm1(-l)))<1e-8);
 }
 const {quote}=fixture();const p=priceNhlShadow({eventProbability:.3,lambda:.5},{...quote,line:1});
 assert.ok(Math.abs(p.push-nhlHurdleMass(.3,.5)[1])<1e-12);assert.ok(Math.abs(p.over+p.under+p.push-1)<1e-12);
});
test('exact-price EV permits either side and abstains at negative value without a direction quota',()=>{
 const {quote}=fixture();const over=priceNhlShadow({eventProbability:.3,lambda:.5},quote);
 assert.equal(over.candidateSide,'OVER');assert.ok(Math.abs(over.overEv-.2)<1e-12);
 const under=priceNhlShadow({eventProbability:.2,lambda:.5},{...quote,underPrice:-200});assert.equal(under.candidateSide,'UNDER');assert.ok(Math.abs(under.underEv-.2)<1e-12);
 assert.equal(priceNhlShadow({eventProbability:.5,lambda:.5},{...quote,overPrice:-110,underPrice:-110}).candidateSide,null);
 assert.equal(over.selectionApproved,false);
});
test('capture binds exact quote, fixture, frozen models and unrounded reproducible input history',()=>{
 for(const market of ['goals','assists']){
  const input=fixture(market),before=structuredClone(input),r=captureNhlShadow(input,now);
  assert.equal(r.production,false);assert.equal(r.forecast.selectionApproved,false);assert.equal(r.forecast.features.length,14);assert.equal(r.historySha256,digest(input.history));assert.equal(r.quote.line,.5);
  assert.deepEqual(nhlShadowForecast(r.model,r.history,r.target,r.createdAt).forecast,r.forecast&&(({pricing,...f})=>f)(r.forecast));
  assert.deepEqual(input,before);assert.doesNotThrow(()=>verifyShadowReceipt(JSON.parse(JSON.stringify(r))));
  assert.throws(()=>verifyShadowReceipt({...r,quote:{...r.quote,line:1.5}}),/checksum/);
 }
});
test('capture rejects stale, backdated, mismatched and after-start evidence',()=>{
 const input=fixture();
 for(const patch of [
  {sourceFetchedAt:'2026-11-14T11:58:00Z'},
  {sourceFetchedAt:'2026-11-14T12:01:00Z'},
  {quote:{...input.quote,updatedAt:'2026-11-14T11:00:00Z'}},
  {quote:{...input.quote,quoteMarket:'assists'}},
  {quote:{...input.quote,playerId:'456'}},
  {quote:{...input.quote,period:'q1'}},
  {officialFixture:{...input.officialFixture,gameState:'LIVE'}},
  {officialFixture:{...input.officialFixture,id:999}},
  {officialFixture:{...input.officialFixture,season:20252026}},
  {modelFreeze:{...input.modelFreeze,modelDigest:'changed'}},
  {modelFreeze:{...input.modelFreeze,at:'2026-11-15T00:00Z'}},
  {history:[...input.history,input.history[0]]},
 ])assert.throws(()=>captureNhlShadow({...input,...patch},now));
 assert.throws(()=>captureNhlShadow(input,Date.parse(input.target.gameTime)+1));
});
test('target outcomes and future games cannot alter captured features or probabilities',()=>{
 const i=fixture(),a=captureNhlShadow(i,now);
 const b=captureNhlShadow({...i,target:{...i.target,actual:999,workload:999},history:[...i.history,{...i.target,actual:999,workload:999,gameTime:'2026-11-14T01:00Z'}]},now);
 assert.deepEqual(a.forecast,b.forecast);
 const other=captureNhlShadow({...i,history:[...i.history,{...i.history[0],teamId:'other',playerId:'other',actual:999,workload:999}]},now);
 assert.deepEqual(a.forecast,other.forecast);
});
test('append-only storage preserves the first receipt and rejects a replacement',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cw08-shadow-'));
 try{
  const i=fixture(),r=captureNhlShadow(i,now),path=await saveShadowReceipt(dir,r),before=await readFile(path,'utf8');await assert.rejects(saveShadowReceipt(dir,r),e=>e.code==='EEXIST');assert.equal(await readFile(path,'utf8'),before);
  await saveShadowReceipt(join(dir,'receipts'),r);await mkdir(join(dir,'grades'));
  const official={...i.officialFixture,gameState:'OFF',playerByGameStats:{homeTeam:{forwards:[{playerId:123,goals:1}],defense:[]}}},grade=gradeNhlShadow(r,official,Date.parse(i.target.gameTime)+3600000);
  await writeFile(join(dir,'grades',r.sha256+'.json'),JSON.stringify({...grade,official}));
  const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/score-cw08-nhl-shadow.mjs',import.meta.url)),dir]);
  const summary=JSON.parse(stdout);assert.equal(summary.releaseApproved,false);assert.equal(summary.results.goals.all.settled,1);assert.equal(summary.results.goals.all.evidenceGates.minimumFinalFixtures,false);assert.equal(summary.results.goals.originalTen.evidenceGates.minimumFinalFixtures,false);assert.equal(summary.results.goals.byLine['0.5'].fixtures,1);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('grading uses saved line, side and prices only after exact official final; pushes refund',()=>{
 const i=fixture(),r=captureNhlShadow(i,now),official={...i.officialFixture,gameState:'OFF',playerByGameStats:{homeTeam:{forwards:[{playerId:123,goals:1,assists:1}],defense:[]}}},end=Date.parse(i.target.gameTime)+3600000;
 const g=gradeNhlShadow(r,official,end);assert.equal(g.status,'hit');assert.equal(g.profit,3);assert.equal(g.receiptSha256,r.sha256);assert.equal(g.production,false);
 assert.throws(()=>gradeNhlShadow(r,{...official,gameState:'LIVE'},end));assert.throws(()=>gradeNhlShadow(r,{...official,id:999},end));
 assert.throws(()=>gradeNhlShadow(r,{...official,playerByGameStats:{}},end));
 const integer=captureNhlShadow({...i,quote:{...i.quote,line:1}},now),push=gradeNhlShadow(integer,official,end);assert.equal(push.status,'push');assert.equal(push.profit,0);
 const original=JSON.stringify(r);gradeNhlShadow(r,official,end);assert.equal(JSON.stringify(r),original);
});
test('invalid model scope, coefficients, count prices and tampering never create shadow predictions',()=>{
 const i=fixture();assert.throws(()=>nhlShadowForecast({...i.model,selectionApproved:true},i.history,i.target,at));
 assert.throws(()=>nhlShadowForecast(i.model,i.history,{...i.target,sport:'nba'},at));
 assert.throws(()=>nhlShadowForecast({...i.model,scales:[0]},i.history,i.target,at));
 for(const patch of [{overPrice:0},{underPrice:NaN},{line:-.5},{line:.25},{mainLine:false}])assert.throws(()=>priceNhlShadow({eventProbability:.3,lambda:.5},{...i.quote,...patch}));
});

test('Cloudflare evidence extractor verifies a complete pregame package and refuses overwrite',async()=>{
 const {encodeShadowArtifacts}=await import('../scripts/cw08-cloudflare-artifacts.mjs');
 const dir=await mkdtemp(join(tmpdir(),'cw08-export-test-'));
 try{
  const input=fixture();input.modelFreeze.commit='007c02b';
  const receipt=captureNhlShadow(input,now),job={accepted:1,production:false,deployed:false,dashboardBuilt:false};
  const files=[{path:'receipts/test.json',content:JSON.stringify(receipt)+'\n'},{path:'job-result.json',content:JSON.stringify(job)+'\n'}],encoded=encodeShadowArtifacts(files),packagePath=join(dir,'package.br');
  await writeFile(packagePath,Buffer.from(encoded.chunks.join(''),'base64'));
  const script=fileURLToPath(new URL('../scripts/extract-cw08-cloudflare-shadow.mjs',import.meta.url)),args=[script,packagePath,encoded.sha256,'2026-11-14T12:00:01Z',join(dir,'verified')];
  const {stdout}=await promisify(execFile)(process.execPath,args);const summary=JSON.parse(stdout);
  assert.equal(summary.accepted,1);assert.deepEqual(summary.markets,{goals:1,assists:0});assert.equal(summary.releaseApproved,false);
  assert.equal(await readFile(join(dir,'verified/receipts/test.json'),'utf8'),files[0].content);
  await assert.rejects(promisify(execFile)(process.execPath,args),/EEXIST/);
  await assert.rejects(promisify(execFile)(process.execPath,[script,packagePath,encoded.sha256,'2026-11-15T12:00:01Z',join(dir,'late')]),/before puck drop/);
  const changed=structuredClone(receipt);changed.forecast.pricing.overEv+=.1;const {sha256,...body}=changed;changed.sha256=digest(body);
  const corrupt=encodeShadowArtifacts([{path:'receipts/test.json',content:JSON.stringify(changed)},files[1]]),corruptPath=join(dir,'corrupt.br');await writeFile(corruptPath,Buffer.from(corrupt.chunks.join(''),'base64'));
  await assert.rejects(promisify(execFile)(process.execPath,[script,corruptPath,corrupt.sha256,'2026-11-14T12:00:01Z',join(dir,'corrupt')]),/do not reproduce/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
