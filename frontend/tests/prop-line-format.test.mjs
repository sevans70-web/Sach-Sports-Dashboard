import test from'node:test';import assert from'node:assert/strict';import{loadTs}from'./load-ts.mjs';
const{propLineText}=await loadTs(new URL('../lib/prop-line-format.ts',import.meta.url));
test('exact quote thresholds never round quarter lines or turn missing evidence into zero',()=>{
 for(const [line,text]of [[.25,'0.25'],[.75,'0.75'],[1.25,'1.25'],[1.5,'1.5'],[258.5,'258.5'],[0,'0'],[-.25,'-0.25']])assert.equal(propLineText(line),text);
 for(const v of [null,undefined,NaN,Infinity,'',false,'0.25'])assert.equal(propLineText(v),'—');
});

test('live sack context retains both quarter-line threshold and exact distance from the line',async()=>{
 const {publicPropContext}=await loadTs(new URL('../lib/public-prop-context.ts',import.meta.url));
 const c=publicPropContext({gameState:'in',liveCurrent:.5,sportsbookLine:.25,quoteVerified:true},'nfl','sacks');assert.match(c.face,/0\.25 above the 0\.25 line/);
});
