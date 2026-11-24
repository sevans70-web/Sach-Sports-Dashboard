import{DatabaseSync}from'node:sqlite';import{createHash}from'node:crypto';
export function recordedAdapter(file,{delay=350,archiveFiles=96}={}){
 const db=new DatabaseSync(file,{readOnly:true}),meta=db.prepare("SELECT identity,json_extract(row_json,'$.sport') sport,json_extract(row_json,'$.stream') stream,json_extract(row_json,'$.game_date') game_date,json_extract(row_json,'$.checksum') checksum,json_extract(row_json,'$.source_bytes') source_bytes FROM records WHERE table_name='history_documents'").all();
 const tables=Object.fromEntries(['worker_pregame_picks','worker_pregame_grades'].map(t=>[t,db.prepare('SELECT row_json FROM records WHERE table_name=?').all(t).map(r=>JSON.parse(r.row_json))]));
 const hash=v=>createHash('md5').update(v).digest('hex');
 const payload=r=>JSON.parse(db.prepare("SELECT row_json FROM records WHERE table_name='history_documents' AND identity=?").get(r.identity).row_json);
 const eligible=r=>!(/^(featured_selections|featured_results|performance_view_|player_history_)/.test(r.stream))&&(!r.stream.startsWith('protected_')||/^protected_(pregame_|final_)/.test(r.stream));
 const drive=Object.fromEntries(['nba','nfl','nhl'].map(sport=>[sport,meta.filter(r=>r.sport===sport&&eligible(r)).sort((a,b)=>b.game_date.localeCompare(a.game_date)||a.stream.localeCompare(b.stream)).slice(0,archiveFiles).map((r,i)=>{const text=JSON.stringify(payload(r).payload);return {...r,id:'source-'+sport+'-'+i,name:r.stream+'_'+r.game_date+'.json',mimeType:'application/json',size:String(Buffer.byteLength(text)),md5Checksum:hash(text),modifiedTime:'2026-11-15T20:00:00Z',text};})]));
 let calls=0,sourceWrites=0,media=0,lists=0,protectedReads=0,legacy=0,active=0,maxActive=0,slow=false,fail=false;
 const withheldGrade=tables.worker_pregame_grades.find(r=>r.sport==='nba'),pending=tables.worker_pregame_picks.find(p=>p.sport==='nba'&&!tables.worker_pregame_grades.some(g=>g.sport===p.sport&&g.market===p.market&&g.game_id===p.game_id&&g.player_id===p.player_id));let released=false;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const stats=()=>({calls,sourceWrites,media,lists,protectedReads,legacy,maxActive,archiveFiles:Object.fromEntries(Object.entries(drive).map(([s,files])=>[s,files.length]))});
 const folder=(id,name)=>({id,name,mimeType:'application/vnd.google-apps.folder',modifiedTime:'2026-11-15T20:00:00Z'});
 return {stats,release:()=>released=true,fail:v=>fail=v,slow:v=>slow=v,close:()=>db.close(),async fetch(req){calls++;const u=new URL(req.url);active++;maxActive=Math.max(maxActive,active);try{
  if(u.hostname==='oauth2.googleapis.com'){await pause(50);return Response.json({access_token:'local-test-only',expires_in:3600});}
  if(req.method!=='GET'){sourceWrites++;throw Error('Source writes forbidden');}
  if(u.hostname==='www.googleapis.com'){
   if(u.searchParams.get('alt')==='media'){
    media++;const f=Object.values(drive).flat().find(f=>u.pathname.endsWith('/'+f.id));if(!f)return new Response('{}',{status:404});await pause(slow?6000:delay);if(fail)return new Response('{}',{status:503});return new Response(f.text,{headers:{'Content-Type':'application/json'}});
   }
   lists++;await pause(50);const parent=u.searchParams.get('q')?.match(/^'([^']+)'/)?.[1];let files=[];
   if(parent==='folder')files=[folder('backup','railway-2026-11-15')];else if(parent==='backup')files=[folder('history','sach-history')];else if(parent==='history')files=['nba','nfl','nhl'].map(s=>folder(s,s));else if(drive[parent])files=drive[parent].map(({text,...f})=>f);
   return Response.json({files});
  }
  if(!u.hostname.endsWith('.supabase.co'))throw Error('Unexpected external source '+u.hostname);
  await pause(75);const t=u.pathname.split('/').at(-1),q=u.searchParams,sport=q.get('sport')?.slice(3),offset=Number(q.get('offset')||0),limit=Number(q.get('limit')||200),select=q.get('select')||'';
  if(tables[t]){protectedReads++;let rows=tables[t].filter(r=>r.sport===sport);if(!released)rows=rows.filter(r=>t==='worker_pregame_grades'?r!==withheldGrade:r!==pending);
   const day=q.get('game_date')?.slice(4);if(day)rows=rows.filter(r=>r.game_date>=day);rows.sort((a,b)=>b.game_date.localeCompare(a.game_date)||a.market.localeCompare(b.market)||a.game_id.localeCompare(b.game_id)||a.player_id.localeCompare(b.player_id));return Response.json(rows.slice(offset,offset+limit));}
  if(t==='history_documents'){
   legacy++;let rows=meta.filter(r=>r.sport===sport);for(const day of q.getAll('game_date')){const v=day.slice(day.startsWith('eq.')?3:4);rows=rows.filter(r=>day.startsWith('eq.')?r.game_date===v:day.startsWith('gte.')?r.game_date>=v:r.game_date<=v);}
   const exact=q.getAll('stream').find(s=>s.startsWith('eq.')),inc=q.getAll('stream').find(s=>s.startsWith('in.'));
   if(exact)rows=rows.filter(r=>r.stream===exact.slice(3));else if(inc){const wanted=new Set(inc.slice(4,-1).split(','));rows=rows.filter(r=>wanted.has(r.stream));}
   else if(q.has('and')||q.getAll('stream').some(s=>s.startsWith('not.like.'))){rows=rows.filter(eligible);const first=q.get('and')?.match(/game_date.gte.([0-9-]+)/)?.[1];if(first)rows=rows.filter(r=>r.game_date>=first);}
   rows.sort((a,b)=>(q.get('order')?.startsWith('game_date.desc')?b.game_date.localeCompare(a.game_date):a.game_date.localeCompare(b.game_date))||a.stream.localeCompare(b.stream));rows=rows.slice(offset,offset+limit);
   return Response.json(select.includes('payload')?rows.map(payload):rows.map(({identity,...r})=>r));
  }return Response.json([]);
 }finally{active--;}}
 };
}
