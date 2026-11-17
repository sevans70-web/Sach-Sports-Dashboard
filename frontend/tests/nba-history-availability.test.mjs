import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {loadTs} from './load-ts.mjs';
const {nbaHistoryUnavailable}=await loadTs(new URL('../lib/nba-history-availability.ts',import.meta.url));
test('actual54Points/52Rebounds incident coverage is an outage, not a successful empty slate',async()=>{
 for(const market of ['points','rebounds']){const d=JSON.parse(await readFile(new URL('../../docs/audits/2026-11-17-r1-approved-rollback/nba-'+market+'-coverage.json',import.meta.url)));const b={...d,rows:[]},original=JSON.stringify(b);assert.equal(nbaHistoryUnavailable(b),true);assert.equal(JSON.stringify(b),original);}
});
test('history outage classification does not hide valid rows, normal empty schedules, model holds or partial forecasts',()=>{
 const b={rows:[],quoteMatchAudit:{integrityVerifiedQuotes:54,fittedForecasts:0},forecastBlockers:{recent_official_history_unavailable:54}};
 assert.equal(nbaHistoryUnavailable({...b,rows:[{playerId:'valid'}]}),false);assert.equal(nbaHistoryUnavailable({...b,quoteMatchAudit:{integrityVerifiedQuotes:0}}),false);assert.equal(nbaHistoryUnavailable({...b,forecastBlockers:{market_model_not_fitted:54}}),false);assert.equal(nbaHistoryUnavailable({...b,fittedResearchForecastCount:1}),false);assert.equal(nbaHistoryUnavailable({...b,forecastBlockers:{recent_official_history_unavailable:1}}),false);
});
