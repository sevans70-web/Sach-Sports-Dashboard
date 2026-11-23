/** Offline evidence integrity verifier. No fetch, credentials, imports or writes. */
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{resolve}from'node:path';
import{fileURLToPath}from'node:url';
export function verifyNbaPopulationStream(text){
 if(!text.endsWith('\n'))throw Error('census_incomplete_stream');const lines=text.slice(0,-1).split('\n'),manifest=JSON.parse(lines[0]),complete=JSON.parse(lines.at(-1));
 if(manifest.type!=='manifest'||manifest.version!==1||manifest.truncated!==false||complete.type!=='complete'||complete.snapshot!==manifest.snapshot)throw Error('census_incomplete_or_mixed_snapshot');
 const offers=lines.slice(1,-1).map(l=>JSON.parse(l)),digest=createHash('sha256').update(lines.slice(1,-1).join('\n')+(offers.length?'\n':'')).digest('hex');
 if(manifest.offerCount!==offers.length||complete.offerCount!==offers.length||manifest.offersSha256!==digest||complete.offersSha256!==digest||manifest.snapshot!==createHash('sha256').update(manifest.observedAt+'|'+digest).digest('hex'))throw Error('census_count_or_checksum');
 const positions=new Set(),counts=Object.fromEntries(Object.keys(manifest.matchedByMarket).map(m=>[m,0]));
 for(const[i,o]of offers.entries()){
  const p=o.sourcePosition,key=JSON.stringify(p);if(o.type!=='offer'||o.index!==i||!p||!['game','book','prop'].every(k=>Number.isInteger(p[k])&&p[k]>=0)||positions.has(key))throw Error('census_sequence_or_duplicate');positions.add(key);
  for(const m of o.matchedMarkets){if(!Object.hasOwn(counts,m))throw Error('census_unknown_market');counts[m]++;}
 }
 if(JSON.stringify(counts)!==JSON.stringify(manifest.matchedByMarket))throw Error('census_market_counts');return{manifest,offers,complete};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Usage: node scripts/verify-nba-population-stream.mjs CAPTURE.ndjson');const r=verifyNbaPopulationStream(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify({verified:true,offers:r.offers.length,matchedByMarket:r.manifest.matchedByMarket,snapshot:r.manifest.snapshot,offersSha256:r.manifest.offersSha256,forecastEligibilityVerified:false}));
}
