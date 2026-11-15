/** Byte-accounted, disposable LRU values; no history or original evidence is evicted. */
export function boundedValueCache<T>(maxBytes:number,maxEntries:number){
 const rows=new Map<string,{value:T;expires:number;bytes:number}>();let bytes=0;
 const remove=(key:string)=>{const hit=rows.get(key);if(hit){bytes-=hit.bytes;rows.delete(key);}};
 return {get(key:string,now=Date.now()){const hit=rows.get(key);if(!hit)return; if(hit.expires<=now){remove(key);return;}rows.delete(key);rows.set(key,hit);return hit.value;},set(key:string,value:T,ttl:number,now=Date.now()){const size=JSON.stringify(value).length*2;if(size>maxBytes)return false;remove(key);for(const [k,v] of rows)if(v.expires<=now)remove(k);while(rows.size&&(rows.size>=maxEntries||bytes+size>maxBytes))remove(rows.keys().next().value!);rows.set(key,{value,expires:now+ttl,bytes:size});bytes+=size;return true;},status:()=>({entries:rows.size,bytes,maxBytes}),clear(){rows.clear();bytes=0;}};
}
