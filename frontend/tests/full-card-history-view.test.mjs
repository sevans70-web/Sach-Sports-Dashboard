import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import vm from 'node:vm';import ts from 'typescript';import {renderToStaticMarkup} from 'react-dom/server';import {createElement} from 'react';import {loadTs} from './load-ts.mjs';
const nodeRequire=createRequire(import.meta.url),history=await loadTs(new URL('../lib/player-card-history.ts',import.meta.url));
const code=ts.transpileModule(await readFile(new URL('../components/unified-player-card.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function component({points=[],effects=[],fetch=()=>{}}={}){
 let n=0;const changes=[];const initial=[10,points,false,'Points'];const module={exports:{}};
 const mocks={react:{useState:v=>{const i=n++;return [initial[i]??v,x=>changes.push({i,x})]},useMemo:f=>f(),useEffect:f=>effects.push(f)},'next/navigation':{useRouter:()=>({back(){}})},'@/lib/player-card-history':history,'@/lib/prop-line-format':{propLineText:String},'@/components/saved-estimated-ev':{useSavedSelection:()=>({selection:null,forecast:null}),SavedEstimatedEv:()=>null},'./unified-player-card.module.css':{default:{}}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name]||nodeRequire(name),Date,Intl,Number,fetch,AbortController,URLSearchParams});
 return {Card:module.exports.UnifiedPlayerCard,changes};
}
for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb'])test(sport+': full card separates numeric recent average from a projection',()=>{
 const {Card}=component({points:[{value:0,date:'2026-10-01'},{value:12,date:'2026-10-02'}]});
 const html=renderToStaticMarkup(createElement(Card,{sport,playerId:'p',query:{name:'Original player',market:'points'}}));
 assert.match(html,/Last 2 average:.*6/);assert.match(html,/Historical results/);assert.match(html,/aria-pressed="true"/);assert.doesNotMatch(html,/Sach projection/);
});
test('full-card history request binds the selected fixture cutoff and drops target/unknown statistics',async()=>{
 const effects=[],requests=[];const {Card,changes}=component({effects,fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({points:[{value:null,date:'2026-10-01'},{value:0,date:'2026-10-02'},{value:10,date:'2026-10-03'},{value:99,date:'2026-10-30T12:00Z',gameId:'target'}]})}}});
 renderToStaticMarkup(createElement(Card,{sport:'nba',playerId:'p',query:{market:'points',gameId:'target',gameTime:'2026-10-30T20:00Z'}}));
 const cleanup=effects[0]();await new Promise(r=>setTimeout(r,0));
 assert.match(requests[0],/before=2026-10-30T20%3A00Z/);
 assert.deepEqual(changes.filter(c=>c.i===1).at(-1).x.map(p=>p.value),[0,10]);cleanup();
});
