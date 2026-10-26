import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {reportedFeaturedOriginal}=await loadTs(new URL('../lib/featured-history-corrections.ts',import.meta.url));
test('reported Waller correction keeps original odds and timestamp unknown and distinguishes the official touchdown',()=>{
 const c=reportedFeaturedOriginal('nfl','2026-10-25','long');assert.equal(c.playerName,'Darren Waller');assert.equal(c.playerId,'2576925');assert.equal(c.officialTouchdowns,1);assert.equal(c.originalOdds,null);assert.equal(c.originalSportsbook,null);assert.equal(c.selectedAt,null);assert.equal(c.originalSelectionVerified,false);assert.equal(c.selectionSource,'user_reported_correction');
});
test('correction affects only the disputed NFL category and day, preserving all other sports and future slates',()=>{
 for(const sport of ['cfb','nba','nhl','cbb','soccer','wnba','mlb'])assert.equal(reportedFeaturedOriginal(sport,'2026-10-25','long'),null);
 assert.equal(reportedFeaturedOriginal('nfl','2026-10-26','long'),null);assert.equal(reportedFeaturedOriginal('nfl','2026-10-25','play'),null);
});
