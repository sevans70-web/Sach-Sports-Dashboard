import{readFileSync,writeFileSync}from'node:fs';import{gunzipSync}from'node:zlib';import{loadTs}from'../../../../frontend/tests/load-ts.mjs';
if(!process.argv[2])throw Error('A private work directory is required');
const w=process.argv[2]?.replace(/\/$/,'')+'/',d=JSON.parse(readFileSync(w+'backup-evidence-private.json')),{footballObservedRows}=await loadTs(new URL('../../../../frontend/lib/football-observed-stats.ts',import.meta.url));
const source=JSON.parse(gunzipSync(readFileSync(new URL('../../../../frontend/tests/fixtures/nfl-official-finals-2026-11-24.json.gz',import.meta.url))));let added=0,replaced=0,overlappingChangedStats=0;
for(const[url,v]of Object.entries(source.records)){if(!url.includes('/summary?'))continue;const p=v.payload,id=String(p.header?.id||'');if(p.header?.competitions?.[0]?.status?.type?.completed!==true)continue;
 const rows=footballObservedRows(p),old=d.finals[id];if(old){replaced++;for(const c of d.cases.filter(c=>c.gameId===id)){const before=old.payload.rows.find(r=>String(r.playerId)===c.playerId)?.stats[c.market],after=rows.find(r=>String(r.playerId)===c.playerId)?.stats[c.market];if(typeof before==='number'&&typeof after==='number'&&before!==after)overlappingChangedStats++;}}else added++;
 d.finals[id]={sourceTime:v.observedAt,sourceStream:'existing_authorized_official_FINAL_fixture',payload:{success:true,state:'post',gameId:id,rows}};
}
writeFileSync(w+'backup-evidence-private.json',JSON.stringify(d));writeFileSync(w+'existing-final-sources.json',JSON.stringify({source:'Existing authorized November24 official-final fixture; no new collection',officialRawFinals:52,added,replaced,overlappingChangedStats,newProviderRequests:0},null,2)+'\n');console.log({added,replaced,overlappingChangedStats});
