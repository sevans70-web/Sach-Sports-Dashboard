"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {CFB_MARKETS} from '@/lib/cfb';
import {savedCfbWindow,savedCfbResult} from '@/lib/saved-cfb-results';
const PERIODS=['Today','Yesterday','Week','Month','Season'];
const WINDOWS=['All','12 PM','Afternoon','Evening'];
export default function CfbResultsPage(){
 const [period,setPeriod]=useState('Today'),[windowName,setWindowName]=useState('All');
 const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[partial,setPartial]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;let active=true;
  setRows([]);setLoading(true);setError('');
  const load=async()=>{
   try{
    const response=await fetch(`/api/history/performance?sport=cfb&includeBoards=true&period=${encodeURIComponent(period)}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw Error('Saved predictions are temporarily unavailable.');
    const payload=await response.json();if(!Array.isArray(payload.records))throw Error('Saved predictions could not be read.');
    if(active){setRows(payload.records);setPartial(payload.partial===true);setError('');}
   }catch(e){if(active)setError(e instanceof Error&&e.name==='TimeoutError'?'Saved predictions took too long to load. Retrying shortly.':'Saved predictions are temporarily unavailable. Retrying shortly.');}
   finally{if(active){setLoading(false);timer=setTimeout(load,20000);}}
  };load();return()=>{active=false;controller.abort();clearTimeout(timer);};
 },[period]);
 const selected=rows.filter(row=>windowName==='All'||savedCfbWindow(row.gameTime)===windowName).sort((a,b)=>String(a.gameTime).localeCompare(String(b.gameTime))||(a.rank||99)-(b.rank||99));
 const button=(value:string,current:string,set:(value:string)=>void)=><button key={value} aria-pressed={value===current} onClick={()=>set(value)} style={{padding:'10px 16px',borderRadius:10,border:value===current?'2px solid #e84d68':'1px solid #555',background:'#11151b',color:'white',whiteSpace:'nowrap'}}>{value}</button>;
 return <main style={{maxWidth:1000,margin:'0 auto',padding:24,color:'#f5f5f5'}}>
  <Link href='/cfb'>← Back to CFB</Link><h1>Saved Predictions / Results</h1>
  <p>Original pregame selections stay here while games are pending, live, or final.</p>
  <div aria-label='History period' style={{display:'flex',gap:8,overflowX:'auto',margin:'18px 0'}}>{PERIODS.map(value=>button(value,period,setPeriod))}</div>
  <div aria-label='Kickoff window' style={{display:'flex',gap:8,overflowX:'auto',margin:'18px 0'}}>{WINDOWS.map(value=>button(value,windowName,setWindowName))}</div>
  {error?<p role='alert'>{error}</p>:null}
  {partial&&!loading?<p>Some saved history is still being retrieved. Available records are shown below.</p>:null}
  {loading?<p role='status'>Loading saved predictions…</p>:!selected.length&&!error?<p>No saved predictions in this period and window.</p>:null}
  {selected.map(row=><article key={row.key} style={{border:'1px solid #3a414d',borderRadius:14,padding:14,margin:'10px 0',background:'#11151b'}}>
   <b>{row.rank?`#${row.rank} `:''}{row.playerName}</b><div>{row.teamName} · {CFB_MARKETS.find(([key])=>key===row.market)?.[2]||row.market}</div>
   <div>{row.matchup}</div><div>{row.gameTime?new Date(row.gameTime).toLocaleString('en-CA',{timeZone:'America/Toronto'}):'Game time unavailable'} ET</div>
   <div>{row.projectionBasis==='historical_baseline'?'Saved historical baseline':'Saved projection'}: {row.projection??'Not recorded'} · Saved line: {row.line??'Not recorded'} · Actual: {row.actual??'Pending'}</div>
   <strong>{savedCfbResult(row)}</strong>
  </article>)}
 </main>;
}
