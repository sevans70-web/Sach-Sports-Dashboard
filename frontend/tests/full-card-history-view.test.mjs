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
const history=await loadTs(new URL('../lib/player-card-history.ts',import.meta.url));
const analysis=await loadTs(new URL('../lib/player-card-analysis.ts',import.meta.url));
const intelligence=await loadTs(new URL('../lib/card-intelligence.ts',import.meta.url));

async function transpile(file){
 const source=await readFile(new URL('../components/'+file,import.meta.url),'utf8');
 return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
}
const [cardCode,chartCode]=await Promise.all([transpile('unified-player-card.tsx'),transpile('recent-player-chart.tsx')]);

function component({points=[],effects=[],fetch=()=>{},evidence={selection:null,forecast:null},fixture={enabled:false,result:null}}={}){
 let n=0;
 const changes=[];
 const initial=[10,points,points,null,false,'Points'];
 const mocks={
  react:{useState:value=>{const i=n++;return [initial[i]??value,x=>changes.push({i,x})]},useMemo:f=>f(),useEffect:f=>effects.push(f)},
  'next/navigation':{useRouter:()=>({back(){}})},
  '@/lib/player-card-history':history,
  '@/lib/prop-line-format':{propLineText:String},
  '@/lib/player-card-analysis':analysis,
  '@/lib/card-intelligence':intelligence,
  '@/components/saved-estimated-ev':{useSavedSelection:()=>evidence},
  './use-player-fixture-result':{usePlayerFixtureResult:()=>fixture},
  './use-player-chart-context':{usePlayerChartContext:()=>null},
  './unified-player-card.module.css':{},
  './recent-player-chart.module.css':{},
  './head-to-head-chart':{HeadToHeadChart:()=>null},
 };
 function evaluate(code){
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name]||nodeRequire(name),Date,Intl,Number,fetch,AbortController,URLSearchParams});
  return module.exports;
 }
 mocks['./recent-player-chart']=evaluate(chartCode);
 return {Card:evaluate(cardCode).UnifiedPlayerCard,changes};
}

for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb'])test(sport+': full card keeps the market grid and sections when evidence is missing',()=>{
 const {Card}=component({points:[{value:0,date:'2026-10-01'},{value:12,date:'2026-10-02'}]});
 const html=renderToStaticMarkup(createElement(Card,{sport,playerId:'p',query:{name:'Original player',market:'points'}}));
 const labels=['EV','Points','Sach Prediction','Sach Projection','Projection vs line','Model probability','Player Analysis','Matchup','Recent Form'];
 for(const label of labels)assert.ok(html.includes('>'+label+'<'),label);
 assert.deepEqual(labels.map(label=>html.indexOf('>'+label+'<')).toSorted((a,b)=>a-b),labels.map(label=>html.indexOf('>'+label+'<')));
 assert.match(html,/2 of .*10.* games with recorded stats.*6.* average/);
 assert.match(html,/aria-pressed="true"/);
 assert.match(html,/Head-to-Head/);
 assert.equal((html.match(/aria-label="Unavailable"/g)||[]).length,6);
});

test('full-card history request binds the selected fixture cutoff and drops target/unknown statistics',async()=>{
 const effects=[],requests=[];
 const {Card,changes}=component({effects,fetch:async url=>{
  requests.push(url);
  return {ok:true,json:async()=>({points:[{value:null,date:'2026-10-01'},{value:0,date:'2026-10-02'},{value:10,date:'2026-10-03'},{value:99,date:'2026-10-30T12:00Z',gameId:'target'}]})};
 }});
 renderToStaticMarkup(createElement(Card,{sport:'nba',playerId:'p',query:{market:'points',gameId:'target',gameTime:'2026-10-30T20:00Z'}}));
 const cleanup=effects[1]();
 await new Promise(r=>setTimeout(r,0));
 assert.match(requests[0],/before=2026-10-30T20%3A00Z/);
 assert.deepEqual(changes.filter(c=>c.i===1).at(-1).x.map(p=>p.value),[0,10]);
 cleanup();
});

test('the full card displays a verified final appearance and stat even when the link has no game status',()=>{
 const {Card}=component({fixture:{enabled:true,result:{state:'post',notice:'Played',actual:22}}});
 const html=renderToStaticMarkup(createElement(Card,{sport:'nba',playerId:'4712849',query:{name:'Anthony Black',gameId:'401909973',market:'points'}}));
 assert.match(html,/Final · Played/);
 assert.match(html,/Final points · 22/);
});
