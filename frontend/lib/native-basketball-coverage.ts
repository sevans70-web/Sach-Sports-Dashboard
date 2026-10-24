/** Discover native market types without promoting raw odds into verified quotes.
 * Only explicitly named market fields leave this diagnostic; never whole blobs. */
export function nativeBasketballCoverage(payload:any){
 const types=new Map<string,number>(),seen=new Set<string>(),candidates:any[]=[];
 const stack=[{v:payload?.data,depth:0}],maxNodes=100000;let scanned=0;
 while(stack.length&&scanned<maxNodes){const {v,depth}=stack.pop()!;scanned++;if(!v||typeof v!=='object'||depth>16)continue;
  if(!Array.isArray(v)&&typeof v.marketType==='string'){
   const id=String(v.marketId??v.id??'');
   if(!id||!seen.has(id)){if(id)seen.add(id);const type=v.marketType.slice(0,160);types.set(type,(types.get(type)||0)+1);
    const name=typeof v.marketName==='string'?v.marketName:typeof v.name==='string'?v.name:'';
    if(/(?:q1|1q|first.?quarter|1st.?quarter|first.?basket|first.?field.?goal)/i.test(type+' '+name)&&candidates.length<40)candidates.push({marketId:id,marketType:type,name:name.slice(0,200),eventId:String(v.eventId??''),runners:Array.isArray(v.runners)?v.runners.length:null});
   }
  }
  for(const child of Object.values(v))if(child&&typeof child==='object')stack.push({v:child,depth:depth+1});
 }
 return {marketTypes:[...types].sort(([a],[b])=>a.localeCompare(b)).slice(0,150),periodCandidates:candidates,truncated:stack.length>0,scanned};
}
