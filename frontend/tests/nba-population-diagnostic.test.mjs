import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {loadTs} from './load-ts.mjs';
import {verifyNbaPopulationStream} from '../scripts/verify-nba-population-stream.mjs';
const {nbaPopulationResponse,createNbaOfficialDiagnostic,nbaDiagnosticSource,NBA_CENSUS_MARKETS}=await loadTs(new URL('../lib/nba-population-diagnostic.ts',import.meta.url));
const sha=s=>createHash('sha256').update(s).digest('hex');
const stamp='2026-11-22T17:45:00Z';
function contract(n){return{data:[{gameId:'source-game',awayTeam:'Away',homeTeam:'Home',commenceTime:'2026-11-22T23:00Z',books:[{key:'book',props:Array.from({length:n},(_,i)=>({propId:'original-'+i,playerId:i,playerName:'Contract '+i,category:NBA_CENSUS_MARKETS[i%7],period:'game',line:10.5,overPrice:i%3?100:-110,underPrice:i%3?-110:null,lastUpdate:stamp,active:i%9!==0,privateField:'never-returned'}))}]}]};}
async function verify(response){const text=await response.text(),lines=text.trimEnd().split('\n'),objects=lines.map(l=>JSON.parse(l)),manifest=objects.shift(),complete=objects.pop();assert.equal(manifest.type,'manifest');assert.equal(complete.type,'complete');assert.equal(manifest.offerCount,objects.length);assert.equal(complete.offerCount,objects.length);assert.equal(complete.snapshot,manifest.snapshot);const actual=sha(lines.slice(1,-1).join('\n')+'\n');assert.equal(actual,manifest.offersSha256);assert.equal(actual,complete.offersSha256);assert.deepEqual(objects.map(o=>o.index),objects.map((_,i)=>i));return{manifest,offers:objects,text};}

test('single-snapshot stream retains all5518 contract offers including invalid prices/holds, exact IDs/nulls and bottom players',async()=>{
 const payload=contract(5518),original=JSON.stringify(payload),r=await verify(nbaPopulationResponse(payload,stamp));
 assert.equal(r.manifest.truncated,false);assert.equal(r.manifest.sourceProps,5518);assert.equal(r.offers.length,5518);assert.equal(r.offers[5517].prop.propId,'original-5517');assert.equal(r.offers[0].prop.playerId,0);assert.equal(r.offers[0].prop.underPrice,null);assert.equal(r.offers[0].prop.active,false);assert.ok(!r.text.includes('never-returned'));assert.deepEqual(r.offers[0].omittedPropFields,['privateField']);assert.equal(JSON.stringify(payload),original);assert.equal(Object.values(r.manifest.matchedByMarket).reduce((a,b)=>a+b,0),5518);
 const explicit=contract(1);explicit.data[0].books[0].props[0].period='q1';const held=await verify(nbaPopulationResponse(explicit,stamp));assert.deepEqual(held.offers[0].matchedMarkets,[]);assert.deepEqual(held.offers[0].candidateMarkets,['points']);
 const nested=contract(1);nested.data[0].books[0].props[0].player={player_id:'original-nested-id',displayName:'Original Name',debug:'not-returned'};const n=await verify(nbaPopulationResponse(nested,stamp));assert.deepEqual(n.offers[0].prop.player,{player_id:'original-nested-id',displayName:'Original Name'});assert.deepEqual(n.offers[0].omittedIdentityFields.player,['debug']);assert.ok(!n.text.includes('not-returned'));
 console.log('CENSUS_CONTRACT_CAPACITY',JSON.stringify({syntheticContractOnly:true,offers:r.offers.length,truncated:false,lastIdentity:r.offers.at(-1).prop.propId,noProductionAccess:true}));
});

test('reused live bounded samples retain all4508 observed offers; does not recreate the1010 absent raw offers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-census-samples-'));try{
  execFileSync('tar',['-xzf',resolve('../docs/audits/2026-11-22-nba-diagnostic-live/evidence.tar.gz'),'-C',dir]);let total=0,omitted=0;const counts={};
  for(const market of NBA_CENSUS_MARKETS){const s=JSON.parse(await readFile(join(dir,`odds-${market}.json`))),r=await verify(nbaPopulationResponse({data:s.games},stamp));assert.equal(r.offers.length,s.diagnostics.returnedProps);for(const o of r.offers){const raw=s.games[o.sourcePosition.game].books[o.sourcePosition.book].props[o.sourcePosition.prop];for(const key of Object.keys(raw))if(Object.hasOwn(o.prop,key))assert.deepEqual(o.prop[key],raw[key]);}total+=r.offers.length;omitted+=s.diagnostics.propsOmitted;counts[market]=r.offers.length;}
  assert.equal(total,4508);assert.equal(omitted,1010);console.log('CENSUS_REUSED_SOURCE',JSON.stringify({retainedOffers:total,unrecoverableFromBoundedEvidence:omitted,markets:counts,noRepeatCardAudit:true,noLiveCollection:true}));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('census limits fail before success headers and canceled streams cannot be mistaken for a complete census',async()=>{
 assert.throws(()=>nbaPopulationResponse({error:'private'},stamp),/census_schema/);assert.throws(()=>nbaPopulationResponse(contract(25001),stamp),/census_(candidate_limit|response_size)/,'either hard bound must reject before headers');
 const controller=new AbortController(),response=nbaPopulationResponse(contract(3),stamp,controller.signal),reader=response.body.getReader();await reader.read();controller.abort();await assert.rejects(reader.read());
 const huge=contract(1);huge.data[0].books[0].props[0].playerName='x'.repeat(9000);assert.throws(()=>nbaPopulationResponse(huge,stamp),/census_field_size/);
});

test('offline verifier refuses changed observation clocks and duplicate positions even with recomputed content digests',async()=>{
 const text=await nbaPopulationResponse(contract(2),stamp).text(),rows=text.trimEnd().split('\n').map(JSON.parse);assert.equal(verifyNbaPopulationStream(text).offers.length,2);
 const clock=structuredClone(rows);clock[0].observedAt='2026-11-23T17:45:00Z';assert.throws(()=>verifyNbaPopulationStream(clock.map(JSON.stringify).join('\n')+'\n'),/checksum/);
 rows[2].sourcePosition=rows[1].sourcePosition;const body=rows.slice(1,-1).map(JSON.stringify).join('\n')+'\n',digest=sha(body),snapshot=sha(stamp+'|'+digest);rows[0].offersSha256=rows.at(-1).offersSha256=digest;rows[0].snapshot=rows.at(-1).snapshot=snapshot;
 assert.throws(()=>verifyNbaPopulationStream(rows.map(JSON.stringify).join('\n')+'\n'),/duplicate/);
 assert.equal(verifyNbaPopulationStream(await nbaPopulationResponse({data:[]},stamp).text()).offers.length,0,'an empty source export is not a claim of valid predictions');
});

const request=q=>new Request('https://test/api/market-coverage?sport=nba&mode=source-census&'+q);
test('official source reader uses only exact public NBA resources; rejects arbitrary URLs/credentials/redirects',async()=>{
 let calls=0;const read=createNbaOfficialDiagnostic(async(url,init)=>{calls++;assert.equal(url,'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401910028');assert.equal(init.redirect,'manual');assert.equal(init.headers['User-Agent'],'Mozilla/5.0 (compatible; SachSports/1.0)');assert.equal(init.headers.Authorization,undefined);return Response.json({header:{id:'401910028'},boxscore:{players:[]},privateKey:'not exposed'});});
 for(const q of ['kind=summary&id=1&url=https://elsewhere.test','kind=gamelog&id=1','kind=summary&id=abc','kind=summary&id=1&id=2'])assert.equal((await read(request(q))).status,400);
 assert.equal(calls,0);const result=await read(request('kind=summary&id=401910028')),body=await result.json();assert.equal(body.sourceStatus,200);assert.equal(body.payloadSha256,sha(JSON.stringify(body.payload)));assert.ok(!JSON.stringify(body).includes('not exposed'));assert.equal(calls,1);
 let canceled=false;const redirect=createNbaOfficialDiagnostic(async()=>new Response(new ReadableStream({cancel(){canceled=true;}}),{status:302,headers:{Location:'https://other.test'}}));assert.equal((await(await redirect(request('kind=summary&id=1'))).json()).reason,'official_source_redirect_rejected');assert.equal(canceled,true);
 assert.throws(()=>nbaDiagnosticSource(new URLSearchParams('kind=team_schedule&id=2&season=1990')),/season/);
});

test('403 denies one exact source,429 honors an origin cooldown, without retries or credential changes',async()=>{
 for(const status of [403,429]){let calls=0;const read=createNbaOfficialDiagnostic(async()=>{calls++;return new Response('denied',{status,headers:{'Retry-After':'120'}});});assert.equal((await read(request('kind=summary&id=1'))).status,503);const cached=await read(request('kind=summary&id=1'));assert.equal(cached.status,429);assert.ok(Number(cached.headers.get('Retry-After'))>=119);assert.equal(calls,1);if(status===429){assert.equal((await read(request('kind=roster&id=2'))).status,429);assert.equal(calls,1);}}
});

test('source bodies are bounded and cancellation releases admission, without writes or detached requests',async()=>{
 let canceled=0;const large=createNbaOfficialDiagnostic(async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){canceled++;}})));assert.equal((await large(request('kind=summary&id=1'))).status,503);assert.equal(canceled,1);
 const controller=new AbortController();let release;const read=createNbaOfficialDiagnostic(async()=>new Response(new ReadableStream({start(){release=()=>controller.abort();},cancel(){canceled++;}})));const pending=read(new Request(request('kind=summary&id=1'),{signal:controller.signal}));await new Promise(r=>setTimeout(r,0));release();assert.equal((await pending).status,503);assert.equal(canceled,2);
});

test('two active official reads admit no third fetch; cancellation cannot strand admission slots',async()=>{
 const pending=[];let calls=0;const read=createNbaOfficialDiagnostic(async()=>{calls++;return new Promise(resolve=>pending.push(resolve));});
 const a=read(request('kind=summary&id=1')),b=read(request('kind=summary&id=2'));assert.equal((await read(request('kind=summary&id=3'))).status,429);assert.equal(calls,2);
 for(const done of pending)done(Response.json({header:{},boxscore:{players:[]}}));assert.equal((await a).status,200);assert.equal((await b).status,200);
});
