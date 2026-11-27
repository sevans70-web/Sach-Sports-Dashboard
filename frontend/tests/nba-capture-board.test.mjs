import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTs } from './load-ts.mjs';
import { checksum, cloudHistoryReadOnly, cloudRequest } from '../scripts/history-cloud.mjs';
import { runJobBudget } from '../jobs/budget.mjs';
import { capturePhase } from '../jobs/tasks.mjs';

const root = await mkdtemp(join(tmpdir(), 'nba-capture-board-'));
process.env.SACH_HISTORY_DIR = root;
process.env.SUPABASE_URL = 'https://storage.fixture.invalid';
process.env.SUPABASE_SECRET_KEY = 'fixture-only';
delete process.env.SACH_ENABLE_WORKER_HISTORY_WRITES;
const nativeNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { value: {userAgent:'Cloudflare-Workers'}, configurable:true });
const RealDate = Date;
const nativeFetch = globalThis.fetch;
const day = '2026-11-26';
const pregame = '2026-11-26T22:59:00.000Z';
const tipoff = '2026-11-26T23:00:00.000Z';
const afterTipoff = '2026-11-26T23:05:00.000Z';
const key = 'nba|slate_board_points|' + day;
let clock = Date.parse(pregame);
globalThis.Date = class extends RealDate {
 constructor(...args) { super(...(args.length ? args : [clock])); }
 static now() { return clock; }
};
const {persistCapturedNbaSlateBoard, frozenNbaSlateBoard} =
 await loadTs(new URL('../lib/nba-slate-board.ts', import.meta.url));
after(async () => {
 globalThis.fetch = nativeFetch;
 globalThis.Date = RealDate;
 Object.defineProperty(globalThis, 'navigator', nativeNavigator);
 await rm(root, {recursive:true, force:true});
});

const games = [
 {gameId:'fixture-early', tipoff, state:'pre'},
 {gameId:'fixture-late', tipoff:'2026-11-27T01:00:00.000Z', state:'pre'},
];
const approvedSchedule=Object.fromEntries(games.map(game=>[
 game.gameId,new Date(game.tipoff).toISOString(),
]));
function board(quotePrefix='quote') {
 const rows = Array.from({length:25}, (_, index) => {
  const quoteId = quotePrefix + index;
  const fixture = games[index % 2];
  return {
   rank:index+1, sport:'nba', market:'points', gameId:fixture.gameId, gameTime:fixture.tipoff,
   playerId:String(index+1), quoteId, quoteVerified:true, quoteVersion:1, quoteUpdatedAt:pregame,
   sportsbook:'FanDuel', sportsbookKey:'fanduel', lineType:'main', sportsbookLine:9.5,
   overPrice:-110, underPrice:-110,
   researchForecast:{status:'available', projection:12, modelSelection:{
    side:'OVER', line:9.5, price:-110, sportsbookKey:'fanduel', quoteId, calculatedAt:pregame,
   }},
  };
 });
 return {success:true, market:'points', boardDay:day, publicRankingCount:rows.length, rows};
}

function storage() {
 clock = Date.parse(pregame);
 const documents = new Map();
 const calls = [];
 const failures = {};
 globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  assert.equal(url.origin, 'https://storage.fixture.invalid');
  if(url.pathname==='/rest/v1/rpc/verified_nba_board_schedule'){
   assert.equal(init.method??'GET','GET');
   assert.equal(url.searchParams.get('p_day'),day);
   calls.push(['APPROVAL',day]);
   if(failures.approvalMissing)return new Response(null,{status:404});
   return Response.json(failures.approval===undefined?approvedSchedule:failures.approval);
  }
  assert.equal(url.pathname, '/rest/v1/history_documents');
  if (init.method === 'POST') {
   assert.equal(url.searchParams.get('on_conflict'), 'sport,stream,game_date');
   assert.equal(new Headers(init.headers).get('Prefer'), 'resolution=ignore-duplicates,return=minimal');
   const document = JSON.parse(init.body);
   const identity = [document.sport,document.stream,document.game_date].join('|');
   calls.push(['POST',identity]);
   assert.equal(document.checksum, checksum(document.payload));
   assert.equal(document.source_updated_at, document.payload[0].capturedAt);
   assert.deepEqual(document.payload[0].captureSchedule,approvedSchedule);
   if (failures.post) return new Response(null,{status:503});
   if (!documents.has(identity)) {
    documents.set(identity,{...document,updated_at:failures.recordedAt??new Date().toISOString()});
   }
   if (failures.ack) throw Error('Simulated acknowledgement loss after insert');
   if (failures.corrupt) documents.get(identity).checksum = '0'.repeat(64);
   return new Response(null,{status:201});
  }
  const identity = ['sport','stream','game_date'].map(field=>url.searchParams.get(field).slice(3)).join('|');
  calls.push(['GET',identity]);
  if (failures.read) return new Response(null,{status:503});
  return Response.json(documents.has(identity)?[documents.get(identity)]:[]);
 };
 return {documents,calls,failures};
}

test('default Worker persists the exact first board and a cold post-tip reader reloads it without KV', async () => {
 const db = storage();
 const input = board();
 assert.equal(cloudHistoryReadOnly(),true);
 await assert.rejects(cloudRequest('history_documents',{method:'POST'}),/read-only/);
 const result = await persistCapturedNbaSlateBoard(input,games,day,'points');
 assert.equal(result.boardSaved,true);
 assert.equal(result.boardCapturedAt,pregame);
 assert.deepEqual(result.rows,input.rows);
 assert.deepEqual(db.calls,[['APPROVAL',day],['POST',key],['GET',key]]);
 const first = structuredClone(db.documents.get(key));
 clock = Date.parse(afterTipoff);
 // The direct insert and its verification do not seed the display reader's cache.
 const frozen = await frozenNbaSlateBoard('points',games,clock,day);
 assert.equal(frozen.boardUnavailable,false);
 assert.equal(frozen.boardCapturedAt,pregame);
 assert.deepEqual(frozen.rows.map(row=>[row.rank,row.playerId,row.quoteId,row.researchForecast]),
  input.rows.map(row=>[row.rank,row.playerId,row.quoteId,row.researchForecast]));
 assert.equal(frozen.verifiedQuoteCount,25);
 assert.deepEqual(db.calls.at(-1),['GET',key]);
 assert.deepEqual(db.documents.get(key),first);
});

test('concurrent and repeated captures retain the first complete board, capture timestamp and checksum', async () => {
 const db = storage();
 const original = board('original');
 const [first,second] = await Promise.all([
  persistCapturedNbaSlateBoard(original,games,day,'points'),
  persistCapturedNbaSlateBoard(board('different'),games,day,'points'),
 ]);
 const saved = structuredClone(db.documents.get(key));
 clock++;
 const repeat = await persistCapturedNbaSlateBoard(board('retry'),games,day,'points');
 for (const result of [first,second,repeat]) {
  assert.deepEqual(result.rows,original.rows);
  assert.equal(result.boardCapturedAt,pregame);
 }
 assert.equal(db.documents.size,1);
 assert.deepEqual(db.documents.get(key),saved);
});

test('mis-scoped, incomplete and unavailable boards produce no storage request', async () => {
 const db = storage();
 for (const patch of [
  {boardDay:'2026-11-27'}, {market:'rebounds'}, {success:false}, {cached:true}, {dataState:'stale'},
  {boardUnavailable:true}, {rows:[],publicRankingCount:0}, {publicRankingCount:26},
 ]) {
  await assert.rejects(persistCapturedNbaSlateBoard({...board(),...patch},games,day,'points'),
   {message:'nba_capture_board_unverified'});
 }
 for (const patch of [
  {market:'rebounds'}, {sport:'nfl'}, {quoteVerified:false}, {quoteId:''}, {quoteUpdatedAt:tipoff},
  {gameId:'unlisted'}, {rank:2}, {gameTime:'2026-11-28T01:00:00Z'}, {quoteMarket:'rebounds'}, {quotePeriod:'q1'},
 ]) {
  const candidate = board();
  Object.assign(candidate.rows[0],patch);
  await assert.rejects(persistCapturedNbaSlateBoard(candidate,games,day,'points'),
   {message:'nba_capture_board_unverified'});
 }
 assert.deepEqual(db.calls,[]);
});

test('earliest tipoff governs the initial check and a second check after job budget gating', async () => {
 const db = storage();
 const lateGamesOnly = board();
 lateGamesOnly.rows = lateGamesOnly.rows.filter(row=>row.gameId==='fixture-late')
  .map((row,index)=>({...row,rank:index+1}));
 lateGamesOnly.publicRankingCount = lateGamesOnly.rows.length;
 let gates=0;
 await assert.rejects(runJobBudget({
  env:{},store:{},gate:async()=>{if(++gates===2)clock=Date.parse(tipoff);return 0;},
 },()=>persistCapturedNbaSlateBoard(lateGamesOnly,games,day,'points')),
 {message:'nba_capture_board_locked'});
 await assert.rejects(persistCapturedNbaSlateBoard(lateGamesOnly,games,day,'points'),
  {message:'nba_capture_board_locked'});
 assert.deepEqual(db.calls,[['APPROVAL',day]]);
});

test('missing, expired and differing independent schedule evidence prevents any insert', async () => {
 for(const mode of ['missing-endpoint','missing-approval','different-fixtures','earlier-tipoff']){
  const db=storage();
  if(mode==='missing-endpoint')db.failures.approvalMissing=true;
  if(mode==='missing-approval')db.failures.approval=null;
  if(mode==='different-fixtures')db.failures.approval={'other-game':tipoff};
  if(mode==='earlier-tipoff')db.failures.approval={...approvedSchedule,'fixture-early':pregame};
  await assert.rejects(persistCapturedNbaSlateBoard(board(),games,day,'points'),
   {message:'nba_capture_board_storage_unverified'});
  assert.deepEqual(db.calls,[['APPROVAL',day]]);
  assert.equal(db.documents.size,0);
 }
});

test('operator scope pins the entire schedule and stops a delayed write at grant expiry', async () => {
 const db=storage();
 const lock=Date.parse(tipoff),expires=clock+500;
 const acceptance={day,lock,expires,scheduleSha256:checksum({...approvedSchedule,'another-fixture':tipoff})};
 const budget={env:{},store:{},gate:async()=>0,acceptance};
 await assert.rejects(runJobBudget(budget,()=>persistCapturedNbaSlateBoard(board(),games,day,'points')),
  {message:'nba_capture_board_unverified'});
 assert.deepEqual(db.calls,[]);
 let gates=0;
 await assert.rejects(runJobBudget({...budget,acceptance:{...acceptance,scheduleSha256:checksum(approvedSchedule)},
  gate:async()=>{if(++gates===2)clock=expires;return 0;},
 },()=>persistCapturedNbaSlateBoard(board(),games,day,'points')),{message:'nba_capture_board_locked'});
 assert.deepEqual(db.calls,[['APPROVAL',day]]);
});

test('storage errors and uncertain writes do not succeed, and retries verify the original without overwriting', async () => {
 const original = board('first');
 for (const failure of ['post','ack','read','corrupt']) {
  const db = storage();
  db.failures[failure]=true;
  await assert.rejects(persistCapturedNbaSlateBoard(original,games,day,'points'),
   {message:'nba_capture_board_storage_unverified'});
  if (failure==='post') {
   assert.equal(db.documents.size,0);
  } else {
   const saved = structuredClone(db.documents.get(key));
   db.failures[failure]=false;
   const retry = persistCapturedNbaSlateBoard(board('retry'),games,day,'points');
   if (failure==='corrupt') await assert.rejects(retry,{message:'nba_capture_board_storage_unverified'});
   else assert.deepEqual((await retry).rows,original.rows);
   assert.deepEqual(db.documents.get(key),saved);
  }
 }
});

test('late database timestamps fail publication and a cold reader rejects the same original', async () => {
 const db=storage();
 db.failures.recordedAt=tipoff;
 const input=board();
 // Use a separate market to avoid a previously warmed local display cache.
 const market='assists';
 input.market=market;
 for(const row of input.rows)row.market=market;
 await assert.rejects(persistCapturedNbaSlateBoard(input,games,day,market),
  {message:'nba_capture_board_storage_unverified'});
 clock=Date.parse(afterTipoff);
 await assert.rejects(frozenNbaSlateBoard(market,games,clock,day),
  {message:'NBA capture board database timestamp unverified'});
 assert.equal(db.calls.filter(([method])=>method==='POST').length,1);
});

test('a durable-publication error defers the ranking phase before any receipt or cache write', async () => {
 const db=storage();
 const rank={kind:'capture',sport:'nba',market:'points',phase:'rank'};
 await assert.rejects(capturePhase(rank,{
  route:async()=>Response.json({success:false,rows:[],reason:'nba_capture_board_storage_unverified'},{status:503}),
  publish:()=>assert.fail('Unverified storage must not publish'),
 }), {message:'nba_capture_board_storage_unverified',deferred:true});
 assert.equal(rank.phase,'rank');
 assert.deepEqual(db.calls,[]);
});

test('a checksum-valid wrong-scope original is a conflict and cannot be replaced', async () => {
 const db = storage();
 await persistCapturedNbaSlateBoard(board(),games,day,'points');
 const stored = db.documents.get(key);
 stored.payload[0].market='rebounds';
 stored.checksum=checksum(stored.payload);
 const wrong = structuredClone(stored);
 await assert.rejects(persistCapturedNbaSlateBoard(board('retry'),games,day,'points'),
  {message:'nba_capture_board_storage_unverified'});
 assert.deepEqual(db.documents.get(key),wrong);
});

test('an absent original on another slate or market stays unavailable after lock', async () => {
 const db = storage();
 await persistCapturedNbaSlateBoard(board(),games,day,'points');
 clock=Date.parse(afterTipoff);
 const nextDay='2026-11-27';
 const nextGame={gameId:'next-fixture',tipoff:'2026-11-27T23:00:00Z'};
 for (const result of [
  await frozenNbaSlateBoard('rebounds',games,clock,day),
  await frozenNbaSlateBoard('points',[nextGame],Date.parse(nextGame.tipoff)+1,nextDay),
 ]) {
  assert.equal(result.boardUnavailable,true);
  assert.deepEqual(result.rows,[]);
 }
 assert.deepEqual(db.calls.slice(-2),[['GET','nba|slate_board_rebounds|'+day],['GET','nba|slate_board_points|'+nextDay]]);
 assert.equal(db.documents.size,1);
});
