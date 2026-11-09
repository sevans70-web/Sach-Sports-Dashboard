import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPTURE_MARKETS,marketsForCaptureTick,originalPregameQuote,captureWorkerPregameMarket,torontoCaptureDay} from '../scripts/worker-pregame-capture.mjs';

const time=Date.parse('2026-11-09T19:00:00Z');
const start='2026-11-09T22:00:00Z';
const updated='2026-11-09T18:59:00Z';
function quote(patch={}){return {sport:'nba',market:'points',gameId:'12345',playerId:'67890',playerName:'Example Player',teamName:'Example Team',gameTime:start,gameState:'pre',marketBacked:true,quoteVerified:true,quoteVersion:1,quoteId:'exact-quote',sportsbookKey:'fanduel',sportsbook:'FanDuel',quoteMarket:'points',quotePeriod:'game',lineType:'main',sportsbookLine:22.5,overPrice:-110,underPrice:-110,quoteUpdatedAt:updated,prediction:'OVER',modelProjection:24.1,...patch};}

test('capture rotation covers all five active sports and every configured market, never paused sports',()=>{
 const selected=new Set();
 for(let i=0;i<20;i++)for(const x of marketsForCaptureTick(time+i*300_000))selected.add(x.sport+'|'+x.market);
 assert.deepEqual(selected,new Set(CAPTURE_MARKETS.map(x=>x.sport+'|'+x.market)));
 assert.deepEqual(new Set(CAPTURE_MARKETS.map(x=>x.sport)),new Set(['nba','nfl','nhl','cfb','cbb']));
 assert.equal(marketsForCaptureTick(time).length,6);
});

test('capture requires a fresh, verified official pregame quote and never invents a model selection',()=>{
 const original=originalPregameQuote(quote(),'nba','points',time);
 assert.equal(original.payload.quote.line,22.5);
 assert.equal(original.payload.sourcePrediction,'OVER');
 assert.equal(original.payload.fittedModelPick,null);
 assert.equal(original.prediction_side,null);
 assert.equal(original.sportsbook_line,22.5);
 assert.equal(original.captured_at,undefined,'database assigns immutable server capture timestamp');
 assert.equal(original.game_date,'2026-11-09');
 for(const patch of [
  {quoteVerified:false},{marketBacked:false},{quoteVersion:0},{gameId:''},{playerId:'bad-id'},
  {quoteUpdatedAt:'2026-11-09T18:30:00Z'},{quoteUpdatedAt:'2026-11-09T19:03:00Z'},
  {sportsbookLine:null},{underPrice:null},{quoteId:''},{gameState:'in'}, {boardFrozen:true},
  {gameTime:'2026-11-09T19:01:00Z'},{gameTime:'2026-11-11T23:00:00Z'},
 ])assert.equal(originalPregameQuote(quote(patch),'nba','points',time),null,JSON.stringify(patch));
 assert.equal(originalPregameQuote(quote(),'wnba','points',time),null);
});

test('saved model pick must bind to exact quote and pricing; research baseline alone is not a model pick',()=>{
 const source=quote({researchForecast:{modelSelection:{side:'UNDER',line:22.5,quoteId:'exact-quote',sportsbookKey:'fanduel',price:-110,calculatedAt:'2026-11-09T18:59:30Z'},projection:21.3,validatedForBetting:false}});
 assert.equal(originalPregameQuote(source,'nba','points',time).prediction_side,'UNDER');
 assert.equal(originalPregameQuote(quote({researchForecast:{...source.researchForecast,modelSelection:{...source.researchForecast.modelSelection,quoteId:'wrong'}}}),'nba','points',time).prediction_side,null);
 assert.equal(originalPregameQuote(quote({researchForecast:{...source.researchForecast,modelSelection:{...source.researchForecast.modelSelection,calculatedAt:'2026-11-09T22:01:00Z'}}}),'nba','points',time).prediction_side,null);
});

test('server-backed storage uses insert-only dedup; later quote refresh never replaces the original',async()=>{
 const data=new Map(),requests=[];
 const env={SUPABASE_URL:'https://database.example.test',SUPABASE_SECRET_KEY:'sb_secret_testonly'};
 const backend=async(url,init={})=>{
  const parsed=new URL(url);requests.push({path:parsed.pathname,method:init.method||'GET'});
  assert.match(parsed.pathname,/worker_pregame_originals$/);
  if(init.method==='POST'){
   assert.match(init.headers.Prefer,/ignore-duplicates/);
   for(const row of JSON.parse(init.body))if(!data.has(row.sport+'|'+row.market+'|'+row.game_id+'|'+row.player_id))data.set(row.sport+'|'+row.market+'|'+row.game_id+'|'+row.player_id,row);
   return new Response(null,{status:204});
  }
  return new Response(JSON.stringify([...data.values()].map(x=>({game_id:x.game_id,player_id:x.player_id,checksum:x.checksum}))),{status:200,headers:{'Content-Type':'application/json'}});
 };
 let next=quote();
 const dashboard={fetch:async()=>new Response(JSON.stringify({success:true,rows:[next]}),{status:200})};
 const a=await captureWorkerPregameMarket(env,dashboard,{},'nba','points',time,backend);
 assert.equal(a.stored,1);
 const first=[...data.values()][0],firstHash=first.checksum;
 next=quote({sportsbookLine:23.5,quoteUpdatedAt:'2026-11-09T18:59:30Z'});
 const b=await captureWorkerPregameMarket(env,dashboard,{},'nba','points',time,backend);
 assert.equal(b.stored,0);
 assert.equal(data.size,1);
 assert.equal([...data.values()][0].checksum,firstHash);
 assert.deepEqual(requests.map(x=>x.method),['GET','POST','GET','GET']);
});
test('Toronto game dates are DST-aware',()=>{
 assert.equal(torontoCaptureDay('2026-11-09T01:00:00Z'),'2026-11-08');
 assert.equal(torontoCaptureDay('2026-11-09T22:00:00Z'),'2026-11-09');
});
