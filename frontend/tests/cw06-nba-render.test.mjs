import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import vm from 'node:vm';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {loadTs} from './load-ts.mjs';
const helpers=await loadTs(new URL('../lib/nba-ranking-ev.ts',import.meta.url)),source=await readFile(new URL('../components/nba-ev-metric.tsx',import.meta.url),'utf8'),require=createRequire(import.meta.url),module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>id==='@/lib/nba-ranking-ev'?helpers:require(id)});
const render=ev=>renderToStaticMarkup(React.createElement(module.exports.NbaEvMetric,{ev}));
test('CW06 actual card component renders signed negative, zero and positive research EV',()=>{
 for(const [percent,text] of [[-10,'-10.0%'],[0,'0.0%'],[12.5,'+12.5%']]){const html=render({status:'available',percent,displayText:text,quoteBasis:'current'});assert.ok(html.includes(text));assert.ok(html.includes('Research EV'));assert.ok(html.includes('not validated for betting'));}
});
test('CW06 unavailable reasons are visible text, and saved EV is explicitly labelled',()=>{
 const html=render({status:'unavailable',percent:null,code:'quote_unavailable',reason:'Current sportsbook odds needed'});assert.ok(html.includes('Current sportsbook odds needed'));assert.ok(html.includes('data-ev-status="unavailable"'));
 assert.ok(render({status:'available',percent:0,displayText:'0.0%',quoteBasis:'saved_pregame'}).includes('Saved pregame research EV'));
});
