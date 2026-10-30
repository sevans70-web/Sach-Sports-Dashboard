import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {loadTs} from './load-ts.mjs';
const nodeRequire=createRequire(import.meta.url);
const topPlays=await loadTs(new URL('../lib/top-plays.ts',import.meta.url));
const source=await readFile(new URL('../components/today-top-plays.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function render(sport,{live=null,failed=false,rows=[]}={}){
 let calls=0;
 const mocks={
  react:{useEffect(){},useState:()=>[calls++===0?failed:live,()=>{}]},
  'next/link':{__esModule:true,default:({children,...props})=>createElement('a',props,children)},
  '@/lib/top-plays':topPlays,
  '@/lib/dashboard-contract':{dashboardDay:()=> '2026-10-29'},
  '@/lib/featured-history-corrections':{reportedFeaturedOriginal:()=>null},
  '@/lib/saved-quote-evidence':{savedQuoteQuery:()=>''},
  '@/lib/estimated-ev':{estimatedEvText:()=> 'saved',estimatedEvNotice:()=> 'saved'},
  './today-top-plays.module.css':{default:{}}
 };
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name]||nodeRequire(name),Date,console});
 return renderToStaticMarkup(createElement(module.exports.TodayTopPlays,{sport,rows}));
}
test('all sports wait for originals instead of flashing a different ranking-summary pick',()=>{
 const rows=[{playerName:'Provisional player',playerId:'p',gameId:'g',lineType:'scorer',quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',overPrice:550,gameTime:new Date(Date.now()+3600000).toISOString(),quoteUpdatedAt:new Date().toISOString(),market:'first_basket'}];
 for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb']){
  const html=render(sport,{rows});assert.match(html,/Checking saved plays/);assert.doesNotMatch(html,/Provisional player|No Qualified Pick/);
 }
});
test('failed first load is distinguished from a confirmed board with no qualifying selections',()=>{
 assert.match(render('nhl',{failed:true}),/Saved picks temporarily unavailable/);
 assert.doesNotMatch(render('nhl',{failed:true}),/No Qualified Pick/);
 assert.match(render('nhl',{live:{sport:'nhl',slateDay:'2026-10-29',plays:topPlays.todayTopPlays([],'nhl')}}),/No Qualified Pick/);
});
test('a failed refresh continues to render the confirmed original player and saved price',()=>{
 const pick={row:{playerId:'p',playerName:'Original player',market:'points',sportsbook:'Original Book',sportsbookLine:10.5,prediction:'OVER'},price:350,probability:70};
 const html=render('nba',{failed:true,live:{sport:'nba',slateDay:'2026-10-29',plays:[{key:'play',title:'Play of the Day',pick}]}});
 assert.match(html,/Original player/);assert.match(html,/Original Book/);assert.match(html,/\+350/);assert.doesNotMatch(html,/Checking saved plays|temporarily unavailable/);
 assert.doesNotMatch(render('nfl',{live:{sport:'nba',plays:[{key:'play',title:'Play of the Day',pick}]}}),/Original player/);
});
