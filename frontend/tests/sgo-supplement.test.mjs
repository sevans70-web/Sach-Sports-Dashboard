import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {getSgoSupplement,sgoNbaGames,sgoBookGames}=await loadTs(new URL('../lib/sgo-supplement.ts',import.meta.url));
const {footballBookRows}=await loadTs(new URL('../lib/football-book-quotes.ts',import.meta.url));
const {nbaPropMatchesGame}=await loadTs(new URL('../lib/nba-game-match.ts',import.meta.url));
test('all football markets share one authenticated league request and honor rate-limit cooldown',async()=>{
 const old=globalThis.fetch,key=process.env.SPORTSGAMEODDS_API_KEY;process.env.SPORTSGAMEODDS_API_KEY='test-only';let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({data:[{eventID:'1'}]}),{status:200})};
 const results=await Promise.all(Array.from({length:14},()=>getSgoSupplement('NFL')));assert.equal(calls,1);assert.ok(results.every(x=>x.data[0].eventID==='1'));
 globalThis.fetch=async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'120'}})};
 const limited=await getSgoSupplement('NBA');assert.match(limited.warning,/429/);const waiting=await getSgoSupplement('NCAAF');assert.match(waiting.warning,/retry window/);assert.equal(calls,2);
 }finally{globalThis.fetch=old;if(key==null)delete process.env.SPORTSGAMEODDS_API_KEY;else process.env.SPORTSGAMEODDS_API_KEY=key}
});
test('consensus-only odds cannot become named-book quotes',()=>{
 const games=sgoNbaGames({data:[{teams:{away:{names:{long:'LA Clippers'}},home:{names:{long:'Phoenix Suns'}}},players:{player:{name:'Example Player'}},odds:{one:{playerID:'player',statID:'points',periodID:'1q',sideID:'over',bookOverUnder:5.5,bookOdds:'-110'}}}]});
 assert.equal(games[0].awayTeam,'LA Clippers');assert.equal(games[0].books.length,0);
});
function source(){const book={available:true,overUnder:'49.5',odds:'-110',lastUpdatedAt:'2026-10-19T01:00:00Z'};return {data:[{eventID:'fixture',status:{startsAt:'2026-10-20T00:15:00Z'},teams:{away:{names:{long:'A'}},home:{names:{long:'B'}}},players:{p:{name:'Example Player'}},odds:{over:{playerID:'p',statID:'passing_yards',periodID:'1q',betTypeID:'ou',sideID:'over',opposingOddID:'under',byBookmaker:{fanduel:{...book,altLines:[{overUnder:'20',odds:'-2000'}]}}},under:{playerID:'p',statID:'passing_yards',periodID:'1q',betTypeID:'ou',sideID:'under',opposingOddID:'over',byBookmaker:{fanduel:{...book,odds:'-115'}}}}}]}}
test('book adapter preserves exact quarter, named book, threshold and both prices; ignores alt rungs',()=>{
 const games=sgoBookGames(source()),r=footballBookRows({data:games},'q1_passing_yards',['q1_passing_yards'],Date.parse('2026-10-19T01:01:00Z'))[0];assert.equal(r.sportsbookKey,'fanduel');assert.equal(r.line,49.5);assert.equal(r.overPrice,-110);assert.equal(r.underPrice,-115);assert.equal(games[0].books[0].props.length,1);
});
test('opposing side must match player, quarter, book and line and be available',()=>{
 for(const mutate of [p=>p.data[0].odds.under.periodID='game',p=>p.data[0].odds.under.playerID='other',p=>p.data[0].odds.under.byBookmaker.fanduel.overUnder='50.5',p=>p.data[0].odds.under.byBookmaker.fanduel.available=false,p=>delete p.data[0].odds.under.byBookmaker.fanduel,p=>delete p.data[0].odds.over.opposingOddID]){const p=source();mutate(p);assert.equal(sgoBookGames(p)[0].books.length,0)}
});
test('first basket retains the actual named-book scorer price without manufacturing an Under',()=>{
 const p=source();p.data[0].odds={scorer:{playerID:'p',statID:'firstBasket',periodID:'game',betTypeID:'yn',sideID:'yes',byBookmaker:{fanduel:{available:true,odds:'+700',lastUpdatedAt:'2026-10-19T01:00:00Z'}}}};const r=sgoBookGames(p)[0].books[0].props[0];assert.equal(r.overPrice,700);assert.equal(r.underPrice,null);assert.equal(r.line,null);
});
test('NBA props require the correct opponent and day, never the nearest scheduled game',()=>{
 const game={awayTeam:'LA Clippers',homeTeam:'Phoenix Suns',tipoff:'2026-10-17T23:00:00Z'},prop={matchup:'Los Angeles Clippers @ Phoenix Suns',gameTime:'2026-10-17T23:00:00Z'};
 assert.equal(nbaPropMatchesGame(prop,game),true);assert.equal(nbaPropMatchesGame({...prop,gameTime:'2026-10-19T23:00:00Z'},game),false);assert.equal(nbaPropMatchesGame({...prop,matchup:'LA Clippers @ Los Angeles Lakers'},game),false);
});
