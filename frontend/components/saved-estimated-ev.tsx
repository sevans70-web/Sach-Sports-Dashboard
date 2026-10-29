'use client';
import {useEffect,useState} from 'react';
import {fullCardSelection,fullCardForecast} from '@/lib/full-card-selection';
export function SavedEstimatedEv({sport,playerId,market,gameId,quoteId,forecastAt,metric='ev'}:{sport:string;playerId:string;market:string;gameId?:string;quoteId?:string;forecastAt?:string;metric?:'ev'|'probability'}){
 const [value,setValue]=useState({text:'—',notice:'Loading saved probability and odds'});
 useEffect(()=>{let active=true;setValue({text:'—',notice:'Loading saved probability and odds'});const q=new URLSearchParams({sport,playerId,market});if(gameId)q.set('gameId',gameId);if(quoteId)q.set('quoteId',quoteId);if(forecastAt)q.set('forecastAt',forecastAt);
  fetch('/api/estimated-ev?'+q,{cache:'no-store',signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(v=>{if(active)setValue({text:(metric==='probability'?v.probabilityText:v.text)||'—',notice:v.notice})}).catch(()=>{if(active)setValue({text:'—',notice:'Saved probability and sportsbook odds could not be verified'})});return()=>{active=false};
 },[sport,playerId,market,gameId,quoteId,forecastAt,metric]);
 return <span title={value.notice}>{value.text}</span>;
}

export function useSavedSelection(sport:string,playerId:string,market:string,gameId?:string,quoteId?:string,forecastAt?:string){
 const key=JSON.stringify([sport,playerId,market,gameId,quoteId,forecastAt]);
 const [state,setState]=useState<{key:string;payload:any}|null>(null);
 useEffect(()=>{let active=true;const controller=new AbortController();
 if(gameId&&quoteId){const q=new URLSearchParams({sport,playerId,market,gameId,quoteId});if(forecastAt)q.set('forecastAt',forecastAt);
 fetch('/api/estimated-ev?'+q,{cache:'no-store',signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Evidence unavailable');return r.json()}).then(payload=>{if(active)setState({key,payload})}).catch(()=>{if(active)setState({key,payload:null})});}
 return()=>{active=false;controller.abort()};
 },[key,sport,playerId,market,gameId,quoteId,forecastAt]);
 const payload=state?.key===key?state.payload:null;
 return {selection:fullCardSelection(payload,{playerId,gameId,quoteId,forecastAt}),forecast:fullCardForecast(payload,{playerId,gameId,quoteId})};
}
