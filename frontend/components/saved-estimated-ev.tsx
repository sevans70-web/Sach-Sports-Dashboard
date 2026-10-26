'use client';
import {useEffect,useState} from 'react';
export function SavedEstimatedEv({sport,playerId,market,gameId,quoteId}:{sport:string;playerId:string;market:string;gameId?:string;quoteId?:string}){
 const [value,setValue]=useState({text:'—',notice:'Loading saved probability and odds'});
 useEffect(()=>{let active=true;setValue({text:'—',notice:'Loading saved probability and odds'});const q=new URLSearchParams({sport,playerId,market});if(gameId)q.set('gameId',gameId);if(quoteId)q.set('quoteId',quoteId);
  fetch('/api/estimated-ev?'+q,{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(v=>{if(active)setValue({text:v.text||'—',notice:v.notice})}).catch(()=>{if(active)setValue({text:'—',notice:'Saved probability and sportsbook odds could not be verified'})});return()=>{active=false};
 },[sport,playerId,market,gameId,quoteId]);
 return <span title={value.notice}>{value.text}</span>;
}
