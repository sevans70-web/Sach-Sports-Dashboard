/** Preserve the first verified pregame receipt across serialized Cloudflare jobs. */
export const shadowTargetKey=t=>[t.market,t.gameId,t.playerId].join('|');
export function filterShadowEnrollment(bundle,ledger){
 if(ledger?.kind!=='cw08_cloudflare_shadow_enrollment'||ledger.production!==false||ledger.modelFrozenCommit!=='007c02b'||ledger.study!=='cw08-nhl-v3-prospective-shadow'||!Array.isArray(ledger.targets)||!Array.isArray(bundle.entries))throw Error('Verified shadow enrollment ledger required');
 const enrolled=new Set();
 for(const row of ledger.targets){if(!/^(goals|assists)\|\d+\|\d+$/.test(row.key)||!/^[a-f0-9]{64}$/.test(row.receiptSha256)||enrolled.has(row.key))throw Error('Invalid or duplicate shadow enrollment');enrolled.add(row.key);}
 const excluded=[],entries=[];
 for(const entry of bundle.entries){const key=shadowTargetKey(entry.target);if(enrolled.has(key))excluded.push({key,reason:'first_verified_receipt_already_enrolled'});else entries.push(entry);}
 return {bundle:{...bundle,entries},excluded};
}
