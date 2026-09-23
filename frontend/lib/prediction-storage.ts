export type SnapshotWriteResult={ok:boolean;id?:string;error?:string};

function supabaseUrl(){return (process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"")}
function keys(){return [process.env.SUPABASE_SECRET_KEY,process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.SUPABASE_KEY,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY].map(v=>String(v||"").trim()).filter((v,i,a)=>Boolean(v)&&a.indexOf(v)===i)}
function headers(key:string,prefer="return=representation"){
  const h:any={apikey:key,"Content-Type":"application/json",Accept:"application/json",Prefer:prefer};
  if(!key.startsWith("sb_secret_")&&!key.startsWith("sb_publishable_"))h.Authorization=`Bearer ${key}`;
  return h;
}
async function request(url:string,init:RequestInit,key:string,ms=6500){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{...init,headers:{...headers(key),...(init.headers||{})},cache:"no-store",signal:controller.signal})}
  finally{clearTimeout(timer)}
}

export async function upsertSourceSnapshot(sourceName:string,gameDate:string,payload:any):Promise<SnapshotWriteResult>{
  const url=supabaseUrl(),candidateKeys=keys();
  if(!url||!candidateKeys.length)return{ok:false,error:"Supabase is not configured"};
  const query=`source_snapshots?select=id&source_name=eq.${encodeURIComponent(sourceName)}&game_date=eq.${encodeURIComponent(gameDate)}&order=created_at.desc&limit=1`;
  for(const key of candidateKeys){
    try{
      const read=await request(`${url}/rest/v1/${query}`,{method:"GET"},key);
      if(read.status===401||read.status===403)continue;
      if(!read.ok)return{ok:false,error:`Supabase read ${read.status}`};
      const rows=await read.json(),id=Array.isArray(rows)?rows[0]?.id:undefined;
      const body=JSON.stringify({source_name:sourceName,game_date:gameDate,payload,created_at:new Date().toISOString()});
      const endpoint=id?`${url}/rest/v1/source_snapshots?id=eq.${encodeURIComponent(String(id))}`:`${url}/rest/v1/source_snapshots`;
      const write=await request(endpoint,{method:id?"PATCH":"POST",headers:headers(key,"return=minimal"),body},key);
      if(write.status===401||write.status===403)continue;
      if(write.ok)return{ok:true,id:id?String(id):undefined};
      return{ok:false,error:`Supabase write ${write.status}`};
    }catch(error){return{ok:false,error:error instanceof Error?error.message:String(error)}}
  }
  return{ok:false,error:"Supabase authentication failed"};
}

export function torontoDay(v:Date|string=new Date()){
  const d=typeof v==="string"?new Date(v):v;
  if(Number.isNaN(d.getTime()))return"";
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const g=(t:string)=>p.find(x=>x.type===t)?.value||"";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
